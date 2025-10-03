// Load and display device information
document.addEventListener('DOMContentLoaded', async () => {
  const contentDiv = document.getElementById('content');

  try {
    // Get the last lookup result
    const result = await chrome.storage.local.get('lastLookup');

    if (!result.lastLookup) {
      contentDiv.innerHTML = `
        <div class="no-data">
          <p>Right-click on a hostname to look it up in Sevco</p>
          <a href="#" class="settings-link" id="openSettings">Configure API Settings</a>
        </div>
      `;
      document.getElementById('openSettings').addEventListener('click', (e) => {
        e.preventDefault();
        chrome.runtime.openOptionsPage();
      });
      return;
    }

    const { searchTerm, searchType, hostname, devices, error, timestamp } = result.lastLookup;

    // Support legacy format (hostname field)
    const term = searchTerm || hostname;
    const type = searchType || 'hostname';

    // Check if data is stale (older than 5 minutes)
    const isStale = Date.now() - timestamp > 5 * 60 * 1000;

    if (error) {
      contentDiv.innerHTML = `
        <div class="error">
          <strong>Error looking up ${term}</strong><br>
          ${error}
        </div>
        <div style="margin-top: 12px; text-align: center;">
          <a href="#" class="settings-link" id="openSettings">Check API Settings</a>
        </div>
      `;
      document.getElementById('openSettings').addEventListener('click', (e) => {
        e.preventDefault();
        chrome.runtime.openOptionsPage();
      });
      return;
    }

    // Display device information
    if (devices && devices.length > 1) {
      displayDeviceList(term, type, devices);
    } else if (devices && devices.length === 1) {
      await displayDeviceInfo(devices[0].hostname || term, devices[0]);
    }

  } catch (err) {
    contentDiv.innerHTML = `
      <div class="error">
        An unexpected error occurred: ${err.message}
      </div>
    `;
  }
});

function displayDeviceList(searchTerm, searchType, devices) {
  const contentDiv = document.getElementById('content');

  let html = `
    <div class="device-list">
      <h2>Found ${devices.length} device${devices.length > 1 ? 's' : ''}</h2>
      <div style="font-size: 12px; color: #999; margin-bottom: 16px;">Searching for ${searchType}: "${searchTerm}"</div>
  `;

  devices.forEach((device, index) => {
    const hostname = device.hostname || 'Unknown';
    const ips = formatArray(device.ips) || 'No IP';
    const location = device.geo_ip
      ? `${device.geo_ip.city || ''}${device.geo_ip.city && device.geo_ip.country ? ', ' : ''}${device.geo_ip.country || ''}`.trim() || 'Unknown'
      : 'Unknown';

    html += `
      <div class="device-list-item" data-index="${index}">
        <div class="device-list-hostname">${escapeHtml(hostname)}</div>
        <div class="device-list-detail">
          <strong>IPs:</strong> ${escapeHtml(ips)}
        </div>
        <div class="device-list-detail">
          <strong>Location:</strong> ${escapeHtml(location)}
        </div>
      </div>
    `;
  });

  html += `
    </div>
  `;

  contentDiv.innerHTML = html;

  // Add click handlers to each device
  devices.forEach((device, index) => {
    document.querySelector(`.device-list-item[data-index="${index}"]`).addEventListener('click', async () => {
      await displayDeviceInfo(device.hostname || 'Device', device, searchTerm, searchType, devices);
    });
  });
}

async function displayDeviceInfo(hostname, device, searchTerm, searchType, allDevices) {
  const contentDiv = document.getElementById('content');

  // Extract device information with fallbacks
  const deviceId = device.id || 'Unknown';
  const ipAddresses = formatArray(device.ips || device.ip);
  const os = device.os || 'Unknown';
  const osVersion = device.os_version || '';
  const location = device.geo_ip ? `${device.geo_ip.city || ''}, ${device.geo_ip.country || ''}`.trim().replace(/^,\s*/, '') : 'Unknown';
  const usernames = device.associated_usernames || [];

  // Sources
  const sources = extractSources(device);

  // Vulnerabilities
  const vulnerabilities = extractVulnerabilities(device);

  // Build console URL with org slug
  const settings = await chrome.storage.sync.get(['orgSlug']);
  const orgSlug = settings.orgSlug || 'org';
  const consoleUrl = `https://my.sev.co/${orgSlug}/inventory/${deviceId}`;

  let html = `<div class="content-wrapper">`;

  // Add back button if we came from a list view
  if (searchTerm && searchType && allDevices) {
    html += `
      <div style="margin-bottom: 16px;">
        <button id="backButton" class="back-button">← Back to Results</button>
      </div>
    `;
  }

  html += `
    <h2>
      <span class="hostname">${escapeHtml(hostname)}</span>
    </h2>
  `;

  // IP Addresses
  if (ipAddresses) {
    html += `
      <div class="section">
        <div class="label">IP Address${ipAddresses.includes(',') ? 'es' : ''}</div>
        <div class="value">${ipAddresses}</div>
      </div>
    `;
  }

  // Operating System
  html += `
    <div class="section">
      <div class="label">Operating System</div>
      <div class="value">${escapeHtml(os)}${osVersion ? ' ' + escapeHtml(osVersion) : ''}</div>
    </div>
  `;

  // Location
  if (location !== 'Unknown') {
    html += `
      <div class="section">
        <div class="label">Location</div>
        <div class="value">${escapeHtml(location)}</div>
      </div>
    `;
  }

  // Sources
  if (sources.length > 0) {
    html += `
      <div class="section">
        <div class="label">Sources</div>
        ${sources.map(source => `
          <div style="display: flex; align-items: start; margin-bottom: 12px;">
            <span style="color: ${source.observed ? '#00ff00' : '#ff4444'}; font-size: 16px; margin-right: 8px; line-height: 20px; margin-top: 2px;">●</span>
            <img src="https://my.sev.co/logos/${escapeHtml(source.sourceId)}-sm.svg"
                 style="width: 20px; height: 20px; margin-right: 10px; flex-shrink: 0;"
                 onerror="this.style.display='none'"
                 alt="">
            <div style="flex: 1;">
              <div style="color: #e0e0e0; font-weight: 600; margin-bottom: 2px;">${escapeHtml(source.name)}</div>
              <div style="color: #999; font-size: 11px;">${source.status}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  // Exposures/Vulnerabilities
  if (vulnerabilities.count > 0) {
    html += `
      <div class="section">
        <div class="label">Exposure Vulnerabilities</div>
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
          <span class="badge badge-danger">${vulnerabilities.count}</span>
          <div style="color: #999; font-size: 12px;">
            ${vulnerabilities.count === 1 ? 'vulnerability' : 'vulnerabilities'} detected
          </div>
        </div>
        <div id="vulnerabilities-container">
          <div style="color: #999; font-size: 12px;">Loading vulnerability details...</div>
        </div>
      </div>
    `;
  }

  // Users - fetch details for each username
  if (usernames.length > 0) {
    html += `
      <div class="section">
        <div class="label">Observed Users</div>
        <div id="users-container">
          <div style="color: #999; font-size: 12px;">Loading user details...</div>
        </div>
      </div>
    `;
  }

  // Link to console
  html += `
    <div style="text-align: center; margin-top: 20px;">
      <a href="${consoleUrl}" target="_blank" class="link-button">View in Sevco Console</a>
    </div>
  </div>`;

  contentDiv.innerHTML = html;

  // Add back button click handler
  if (searchTerm && searchType && allDevices) {
    document.getElementById('backButton').addEventListener('click', () => {
      displayDeviceList(searchTerm, searchType, allDevices);
    });
  }

  // Fetch and display user details
  if (usernames.length > 0) {
    fetchUserDetails(usernames);
  }

  // Fetch and display vulnerability details
  if (vulnerabilities.count > 0 && vulnerabilities.items.length > 0) {
    fetchVulnerabilityDetails(vulnerabilities.items);
  }
}

async function fetchUserDetails(usernames) {
  const usersContainer = document.getElementById('users-container');
  if (!usersContainer) return;

  // Show loading state
  usersContainer.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px; color: #999; font-size: 12px;">
      <div class="spinner" style="width: 16px; height: 16px; border-width: 2px;"></div>
      <span>Loading user details...</span>
    </div>
  `;

  try {
    const settings = await chrome.storage.sync.get(['apiKey', 'orgId']);
    if (!settings.apiKey || !settings.orgId) {
      usersContainer.innerHTML = '<div style="color: #ff4444; font-size: 12px;">API credentials not configured</div>';
      return;
    }

    const userDetails = await Promise.all(
      usernames.map(username => lookupUser(username, settings.apiKey, settings.orgId))
    );

    let html = '';
    userDetails.forEach(user => {
      if (user) {
        const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Unknown';
        const email = user.emails && user.emails.length > 0 ? user.emails[0] : 'No email';

        html += `
          <div style="padding: 8px 0; border-bottom: 1px solid #3a3a3a;">
            <div style="color: #e0e0e0; font-weight: 600; margin-bottom: 2px;">${escapeHtml(fullName)}</div>
            <div style="color: #999; font-size: 11px;">${escapeHtml(email)}</div>
          </div>
        `;
      }
    });

    usersContainer.innerHTML = html || '<div style="color: #999; font-size: 12px;">No user details found</div>';
  } catch (error) {
    console.error('Error fetching user details:', error);
    usersContainer.innerHTML = '<div style="color: #ff4444; font-size: 12px;">Error loading user details</div>';
  }
}

async function lookupUser(username, apiKey, orgId) {
  try {
    const response = await fetch('https://api.sev.co/v3/asset/user?lang=en', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'authorization': `Token ${apiKey}`,
        'x-sevco-target-org': orgId
      },
      body: JSON.stringify({
        query: {
          combinator: 'and',
          rules: [
            {
              combinator: 'and',
              rules: [
                {
                  entity_type: 'user',
                  field: 'usernames',
                  operator: 'equals',
                  value: username
                }
              ]
            }
          ]
        },
        limit: 1
      })
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (data.items && data.items.length > 0) {
      return {
        id: data.items[0].id,
        ...data.items[0].attributes
      };
    }
    return null;
  } catch (error) {
    console.error(`Failed to lookup user ${username}:`, error);
    return null;
  }
}

async function fetchVulnerabilityDetails(vulnIds) {
  const vulnsContainer = document.getElementById('vulnerabilities-container');
  if (!vulnsContainer) return;

  // Show loading state
  vulnsContainer.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px; color: #999; font-size: 12px;">
      <div class="spinner" style="width: 16px; height: 16px; border-width: 2px;"></div>
      <span>Loading vulnerability details...</span>
    </div>
  `;

  try {
    const settings = await chrome.storage.sync.get(['apiKey', 'orgId']);
    if (!settings.apiKey || !settings.orgId) {
      vulnsContainer.innerHTML = '<div style="color: #ff4444; font-size: 12px;">API credentials not configured</div>';
      return;
    }

    const vulnDetails = await Promise.all(
      vulnIds.map(vuln => lookupVulnerability(vuln.id, settings.apiKey, settings.orgId))
    );

    let html = '';
    vulnDetails.forEach(vuln => {
      if (vuln) {
        const severityColor = getSeverityColor(vuln.effective_severity);
        const severityText = getSeverityText(vuln.effective_severity);

        html += `
          <div style="padding: 8px 0; border-bottom: 1px solid #3a3a3a;">
            <div style="display: flex; align-items: start; gap: 8px; margin-bottom: 4px;">
              <span style="color: ${severityColor}; font-size: 16px; line-height: 20px;">●</span>
              <div style="flex: 1;">
                <div style="color: #e0e0e0; font-weight: 600; margin-bottom: 2px;">${escapeHtml(vuln.name)}</div>
                <div style="color: #999; font-size: 11px;">Severity: ${severityText} (${vuln.effective_severity.toFixed(1)})</div>
              </div>
            </div>
          </div>
        `;
      }
    });

    vulnsContainer.innerHTML = html || '<div style="color: #999; font-size: 12px;">No vulnerability details found</div>';
  } catch (error) {
    console.error('Error fetching vulnerability details:', error);
    vulnsContainer.innerHTML = '<div style="color: #ff4444; font-size: 12px;">Error loading vulnerability details</div>';
  }
}

async function lookupVulnerability(vulnId, apiKey, orgId) {
  try {
    const response = await fetch('https://api.sev.co/v3/asset/exp_vuln', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'authorization': `Token ${apiKey}`,
        'x-sevco-target-org': orgId
      },
      body: JSON.stringify({
        query: {
          combinator: 'and',
          rules: [
            {
              entity_type: 'exp_vuln',
              field: 'id',
              operator: 'equals',
              value: vulnId
            }
          ]
        },
        limit: 1
      })
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (data.items && data.items.length > 0) {
      return {
        id: data.items[0].id,
        ...data.items[0].attributes
      };
    }
    return null;
  } catch (error) {
    console.error(`Failed to lookup vulnerability ${vulnId}:`, error);
    return null;
  }
}

function getSeverityColor(severity) {
  if (severity >= 7.0) return '#ff4444'; // Critical/High
  if (severity >= 4.0) return '#ffa500'; // Medium
  return '#ffd700'; // Low
}

function getSeverityText(severity) {
  if (severity >= 7.0) return 'High';
  if (severity >= 4.0) return 'Medium';
  return 'Low';
}

function formatArray(value) {
  if (!value) return null;
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(', ') : null;
  }
  return String(value);
}

function extractSources(device) {
  const sources = [];
  const observedSourceIds = new Set();

  // Process observed sources
  if (device.sources && Array.isArray(device.sources)) {
    device.sources.forEach(source => {
      const sourceName = formatSourceName(source.source);
      const lastActivity = source.last_activity_timestamp;
      const timeAgo = lastActivity ? formatTimeAgo(lastActivity) : 'Unknown';

      observedSourceIds.add(source.source);
      sources.push({
        sourceId: source.source,
        name: sourceName,
        observed: true,
        status: `Last activity ${timeAgo}`
      });
    });
  }

  // Add unobserved sources
  if (device.all_sources && Array.isArray(device.all_sources)) {
    device.all_sources.forEach(sourceId => {
      if (!observedSourceIds.has(sourceId)) {
        sources.push({
          sourceId: sourceId,
          name: formatSourceName(sourceId),
          observed: false,
          status: 'Not observed'
        });
      }
    });
  }

  return sources;
}

function formatSourceName(sourceId) {
  if (!sourceId) return 'Unknown';

  // Handle common source name patterns
  return sourceId
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatTimeAgo(timestamp) {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now - then;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffYears > 0) return `${diffYears} ${diffYears === 1 ? 'year' : 'years'} ago`;
  if (diffMonths > 0) return `${diffMonths} ${diffMonths === 1 ? 'month' : 'months'} ago`;
  if (diffDays > 0) return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
  if (diffHours > 0) return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
  if (diffMinutes > 0) return `${diffMinutes} ${diffMinutes === 1 ? 'minute' : 'minutes'} ago`;
  return `${diffSeconds} ${diffSeconds === 1 ? 'second' : 'seconds'} ago`;
}

function extractVulnerabilities(device) {
  // Count exposure vulnerabilities
  if (device.exp_vulns && Array.isArray(device.exp_vulns)) {
    return {
      count: device.exp_vulns.length,
      items: device.exp_vulns
    };
  }

  return { count: 0, items: [] };
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
