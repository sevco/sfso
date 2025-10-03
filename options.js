let orgsData = [];

// Load saved settings
document.addEventListener('DOMContentLoaded', async () => {
  const settings = await chrome.storage.sync.get(['apiKey', 'orgId', 'orgSlug']);

  if (settings.apiKey) {
    document.getElementById('apiKey').value = settings.apiKey;
  }

  // If we have saved settings, show them
  if (settings.orgId && settings.orgSlug) {
    showStatus(`Currently configured: ${settings.orgSlug}`, 'success');
  }
});

// Fetch organizations button
document.getElementById('fetchOrgsBtn').addEventListener('click', async () => {
  const apiKey = document.getElementById('apiKey').value.trim();
  const statusEl = document.getElementById('status');
  const fetchBtn = document.getElementById('fetchOrgsBtn');

  if (!apiKey) {
    showStatus('Please enter an API key first', 'error');
    return;
  }

  fetchBtn.disabled = true;
  fetchBtn.textContent = 'Fetching...';

  try {
    const response = await fetch('https://api.sev.co/v1/admin/org', {
      headers: {
        'authorization': `Token ${apiKey}`,
        'X-Sevco-Target-Org': '*'
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch organizations. Please check your API key.');
    }

    const data = await response.json();
    orgsData = data.orgs;

    if (!orgsData || orgsData.length === 0) {
      throw new Error('No organizations found for this API key');
    }

    // Populate the select dropdown
    const orgSelect = document.getElementById('orgSelect');
    orgSelect.innerHTML = '<option value="">-- Select an organization --</option>';

    // Sort orgs by name
    orgsData.sort((a, b) => a.org_name.localeCompare(b.org_name));

    orgsData.forEach(org => {
      const option = document.createElement('option');
      option.value = org.id;
      option.textContent = org.org_name;
      option.dataset.slug = org.org_slug;
      orgSelect.appendChild(option);
    });

    // Show the org select and save button
    document.getElementById('orgSelectGroup').style.display = 'block';
    document.getElementById('saveBtn').style.display = 'block';

    showStatus(`Found ${orgsData.length} organization(s)`, 'success');

  } catch (error) {
    showStatus('Error: ' + error.message, 'error');
  } finally {
    fetchBtn.disabled = false;
    fetchBtn.textContent = 'Fetch Organizations';
  }
});

// Save settings
document.getElementById('settingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const apiKey = document.getElementById('apiKey').value.trim();
  const orgSelect = document.getElementById('orgSelect');
  const selectedOption = orgSelect.options[orgSelect.selectedIndex];

  if (!selectedOption || !selectedOption.value) {
    showStatus('Please select an organization', 'error');
    return;
  }

  const orgId = selectedOption.value;
  const orgSlug = selectedOption.dataset.slug;
  const orgName = selectedOption.textContent;

  try {
    await chrome.storage.sync.set({
      apiKey,
      orgId,
      orgSlug
    });

    showStatus(`Settings saved successfully! (${orgName})`, 'success');

    setTimeout(() => {
      document.getElementById('status').style.display = 'none';
    }, 3000);
  } catch (error) {
    showStatus('Error saving settings: ' + error.message, 'error');
  }
});

function showStatus(message, type) {
  const statusEl = document.getElementById('status');
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  statusEl.style.display = 'block';
}
