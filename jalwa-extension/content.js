// content.js - Runs on Jalwa website, reads Win Go history
// Sends data to popup on request

(function () {
    // Function to extract Win Go results from the page
    function extractWinGoHistory() {
        const results = [];

        // Try multiple selectors used by different Jalwa site versions
        const selectors = [
            '.record-list .record-item',
            '.history-list .history-item',
            '.lottery-history tr',
            '.game-record-item',
            '[class*="record"] [class*="item"]',
            '.van-cell',
            'table tr',
        ];

        let rows = [];
        for (const sel of selectors) {
            rows = document.querySelectorAll(sel);
            if (rows.length > 3) break;
        }

        // Try to find numbers in the page text using regex
        if (rows.length === 0) {
            // Fallback: scan all text for number patterns
            const allText = document.body.innerText;
            const numberPattern = /\b([0-9])\b/g;
            const matches = allText.match(numberPattern);
            if (matches && matches.length > 5) {
                return { method: 'text_scan', count: matches.length, sample: matches.slice(0, 20) };
            }
            return { error: 'No history found on this page. Make sure you are on the Win Go page.' };
        }

        rows.forEach(row => {
            const text = row.innerText || row.textContent || '';
            // Find single digit numbers (0-9)
            const nums = text.match(/\b([0-9])\b/g);
            if (nums && nums.length > 0) {
                results.push(parseInt(nums[0]));
            }
        });

        return { numbers: results.slice(0, 50), count: results.length };
    }

    // Listen for message from popup
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.action === 'GET_HISTORY') {
            const data = extractWinGoHistory();
            sendResponse(data);
        }
        if (msg.action === 'PING') {
            sendResponse({ status: 'ok', url: window.location.href });
        }
        return true; // async response
    });

    // Auto-scan when page loads
    window.addEventListener('load', () => {
        setTimeout(() => {
            const data = extractWinGoHistory();
            chrome.storage.local.set({ 'jalwa_last_sync': data, 'sync_time': Date.now() });
        }, 2000);
    });
})();
