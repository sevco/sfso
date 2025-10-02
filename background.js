// Create context menu on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'sevcoLookup',
    title: 'Look up "%s" in Sevco',
    contexts: ['selection']
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'sevcoLookup') {
    const searchTerm = info.selectionText.trim();

    // Validate input (basic check)
    if (!searchTerm || searchTerm.length > 253) {
      console.error('Invalid search term selected');
      return;
    }

    // Detect if it's an IPv4 address
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    const isIP = ipv4Regex.test(searchTerm);
    const searchType = isIP ? 'ip' : 'hostname';

    try {
      // Fetch device data from Sevco API
      const deviceData = await lookupDevice(searchTerm, searchType);

      // Store the result for the popup to display
      await chrome.storage.local.set({
        lastLookup: {
          searchTerm,
          searchType,
          devices: deviceData,
          timestamp: Date.now()
        }
      });

      // Open the popup by creating a new window or using the action popup
      chrome.action.openPopup();
    } catch (error) {
      console.error('Sevco lookup error:', error);

      // Store error state
      await chrome.storage.local.set({
        lastLookup: {
          searchTerm,
          searchType,
          error: error.message,
          timestamp: Date.now()
        }
      });

      chrome.action.openPopup();
    }
  }
});

// Lookup device in Sevco API
async function lookupDevice(searchTerm, searchType) {
  // Get API credentials from storage
  const settings = await chrome.storage.sync.get(['apiKey', 'orgId']);

  if (!settings.apiKey || !settings.orgId) {
    throw new Error('API key and Organization ID must be configured in extension settings');
  }

  const apiUrl = 'https://api.sev.co/v3/asset/device';

  // Determine field and operator based on search type
  const field = searchType === 'ip' ? 'ips' : 'hostnames';
  const operator = searchType === 'ip' ? 'equals' : 'contains';

  // Prepare the request body
  const requestBody = {
    query: {
      combinator: "and",
      rules: [
        {
          combinator: "and",
          rules: [
            {
              entity_type: "device",
              field: field,
              operator: operator,
              value: searchTerm
            }
          ]
        }
      ]
    },
    limit: 50
  };

  let response;
  try {
    response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'authorization': `Token ${settings.apiKey}`,
        'x-sevco-target-org': settings.orgId
      },
      body: JSON.stringify(requestBody)
    });
  } catch (error) {
    throw new Error('Network error: Unable to connect to Sevco API');
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('Authentication failed. Please check your API key and Organization ID in settings.');
    } else if (response.status === 404) {
      throw new Error('API endpoint not found. Please contact support.');
    } else {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`API request failed (${response.status}): ${errorText}`);
    }
  }

  let data;
  try {
    data = await response.json();
  } catch (error) {
    throw new Error('Failed to parse API response');
  }

  if (!data.items || data.items.length === 0) {
    throw new Error(`No devices found for ${searchType}: "${searchTerm}"`);
  }

  // Fetch all configured sources
  const allSources = await fetchAllSources(settings.apiKey, settings.orgId);

  // Return all matching devices with flattened structure
  return data.items.map(device => ({
    id: device.id,
    ...device.attributes,
    sources: device.sources,
    source_ids: device.source_ids,
    last_activity_timestamp: device.last_activity_timestamp,
    last_observed_timestamp: device.last_observed_timestamp,
    exp_vulns: device.exp_vulns,
    all_sources: allSources
  }));
}

async function fetchAllSources(apiKey, orgId) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch('https://api.sev.co/v3/asset/device/_facet', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'authorization': `Token ${apiKey}`,
        'x-sevco-target-org': orgId
      },
      body: JSON.stringify({ terms: ['source_ids'] }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn('Failed to fetch sources:', response.status);
      return [];
    }

    const data = await response.json();
    return data.source_ids?.buckets?.map(bucket => bucket.key) || [];
  } catch (error) {
    if (error.name === 'AbortError') {
      console.warn('Fetching sources timed out');
    } else {
      console.error('Failed to fetch all sources:', error);
    }
    return [];
  }
}
