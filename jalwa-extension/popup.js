// popup.js - Handles the extension popup logic
const TOOL_URL = 'https://sachinsinghmar.github.io/wingo-predictor-pro/';
const TOOL_LOCAL = 'http://localhost:8000';

let collectedNumbers = [];

const statusBox = document.getElementById('statusBox');
const readBtn = document.getElementById('readBtn');
const syncBtn = document.getElementById('syncBtn');
const openBtn = document.getElementById('openBtn');

// Chip color helper
function chipClass(n) {
    if (n === 0 || n === 5) return 'violet';
    if (n >= 5) return 'big';
    return 'small';
}

function renderNumbers(nums) {
    if (!nums || nums.length === 0) return '';
    let html = `<div style="margin-top:8px;font-size:0.65rem;color:#64748b;margin-bottom:4px;">Found ${nums.length} results:</div>`;
    html += '<div class="numbers-preview">';
    nums.slice(0, 20).forEach(n => {
        html += `<div class="num-chip ${chipClass(n)}">${n}</div>`;
    });
    html += '</div>';
    return html;
}

// "Read History" button
readBtn.addEventListener('click', async () => {
    statusBox.innerHTML = '⏳ Reading Jalwa page...';
    readBtn.disabled = true;
    syncBtn.disabled = true;

    try {
        // Get the active Jalwa tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        const isJalwa = tab.url && (
            tab.url.includes('jalwa') ||
            tab.url.includes('a7jalx9') ||
            tab.url.includes('ar-lottery') ||
            tab.url.includes('WinGo')
        );

        if (!isJalwa) {
            statusBox.innerHTML = `<span class="error">❌ Please open Jalwa Win Go page first, then click Read History.</span>`;
            readBtn.disabled = false;
            return;
        }

        // Inject content script if not already there, then send message
        let response;
        try {
            response = await chrome.tabs.sendMessage(tab.id, { action: 'GET_HISTORY' });
        } catch (e) {
            // Content script not loaded, inject it
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content.js']
            });
            await new Promise(r => setTimeout(r, 500));
            response = await chrome.tabs.sendMessage(tab.id, { action: 'GET_HISTORY' });
        }

        if (response && response.numbers && response.numbers.length > 0) {
            collectedNumbers = response.numbers;
            statusBox.innerHTML = `<span class="success">✅ ${collectedNumbers.length} results read!</span>${renderNumbers(collectedNumbers)}`;
            syncBtn.disabled = false;
        } else if (response && response.error) {
            statusBox.innerHTML = `<span class="error">❌ ${response.error}</span>`;
        } else {
            // Try direct DOM injection as fallback
            const [result] = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    // Comprehensive DOM scan for numbers
                    const nums = [];
                    // Try table rows
                    document.querySelectorAll('table tr, .record-item, .history-item, [class*="record"]').forEach(el => {
                        const text = el.innerText || '';
                        const m = text.match(/\b([0-9])\b/);
                        if (m) nums.push(parseInt(m[1]));
                    });
                    // Fallback: scan spans and divs for lone digits
                    if (nums.length < 3) {
                        document.querySelectorAll('span, td, .num').forEach(el => {
                            const t = (el.innerText || '').trim();
                            if (/^[0-9]$/.test(t)) nums.push(parseInt(t));
                        });
                    }
                    return [...new Set(nums.map((v, i) => [i, v]))].map(x => x[1]).slice(0, 50);
                }
            });

            if (result.result && result.result.length > 2) {
                collectedNumbers = result.result;
                statusBox.innerHTML = `<span class="success">✅ ${collectedNumbers.length} results read (scan mode)!</span>${renderNumbers(collectedNumbers)}`;
                syncBtn.disabled = false;
            } else {
                statusBox.innerHTML = `<span class="error">❌ Could not read history. Make sure Win Go history is visible on the page.</span>`;
            }
        }
    } catch (err) {
        statusBox.innerHTML = `<span class="error">❌ Error: ${err.message}</span>`;
    }

    readBtn.disabled = false;
});

// "Sync to Tool" button
syncBtn.addEventListener('click', async () => {
    if (!collectedNumbers.length) return;
    statusBox.innerHTML = '⏳ Syncing to Predictor Tool...';
    syncBtn.disabled = true;

    // Store in chrome.storage
    await chrome.storage.local.set({
        'wg_ext_numbers': collectedNumbers,
        'wg_ext_sync_time': Date.now()
    });

    // Find or open tool tab
    const toolTabs = await chrome.tabs.query({ url: [TOOL_URL + '*'] });

    const numbersParam = encodeURIComponent(collectedNumbers.join(','));
    const targetUrl = `${TOOL_URL}?import=${numbersParam}&t=${Date.now()}`;

    if (toolTabs.length > 0) {
        await chrome.tabs.update(toolTabs[0].id, { url: targetUrl, active: true });

    } else {
        await chrome.tabs.create({ url: targetUrl });
    }

    statusBox.innerHTML = `<span class="success">✅ Synced ${collectedNumbers.length} results to Predictor Tool!</span>`;
    syncBtn.disabled = false;
});

// "Open Tool" button
openBtn.addEventListener('click', async () => {
    const toolTabs = await chrome.tabs.query({ url: [TOOL_URL + '*'] });
    if (toolTabs.length > 0) {
        await chrome.tabs.update(toolTabs[0].id, { active: true });
        await chrome.windows.update(toolTabs[0].windowId, { focused: true });
    } else {
        await chrome.tabs.create({ url: TOOL_URL });
    }
    window.close();
});

// Load last sync info
chrome.storage.local.get(['wg_ext_numbers', 'wg_ext_sync_time'], (data) => {
    if (data.wg_ext_numbers && data.wg_ext_numbers.length > 0) {
        const t = data.wg_ext_sync_time ? new Date(data.wg_ext_sync_time).toLocaleTimeString() : '—';
        statusBox.innerHTML = `Last sync: ${t} (${data.wg_ext_numbers.length} results)${renderNumbers(data.wg_ext_numbers)}`;
        collectedNumbers = data.wg_ext_numbers;
        syncBtn.disabled = false;
    }
});
