// --- CHROME EXTENSION AUTO-IMPORT ---
(function () {
    const params = new URLSearchParams(window.location.search);
    const importParam = params.get('import');
    if (importParam) {
        try {
            const nums = importParam.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n) && n >= 0 && n <= 9);
            if (nums.length > 0) {
                const existing = JSON.parse(localStorage.getItem('wg_pro_history') || '[]');
                const newEntries = nums.map((num, i) => ({
                    period: `EXT-${Date.now()}-${i}`,
                    number: num,
                    color: (num === 0 || num === 5) ? 'VIOLET' : (num % 2 === 0 ? 'GREEN' : 'RED'),
                    size: num >= 5 ? 'BIG' : 'SMALL',
                    winSize: null,
                    winColor: null,
                    predSize: null,
                    predColor: null,
                    confidence: null,
                }));
                // Merge new entries at front (most recent first)
                const merged = [...newEntries, ...existing].slice(0, 100);
                localStorage.setItem('wg_pro_history', JSON.stringify(merged));
                // Clean URL without params
                window.history.replaceState({}, document.title, window.location.pathname);
                console.log(`[WinGo Ext] Imported ${nums.length} results from extension.`);
            }
        } catch (e) { console.warn('[WinGo Ext] Import error:', e); }
    }
})();

let history = JSON.parse(localStorage.getItem('wg_pro_history') || '[]');


// DOM Elements
const periodBox = document.getElementById('period-box');
if (!periodBox || !periodBox.value || periodBox.value === "835") if (periodBox) periodBox.value = "884";
const nextDisplay = document.getElementById('next-result');
const numSuggestion = document.getElementById('number-suggestion');
const confFill = document.getElementById('conf-fill');
const confText = document.getElementById('confidence-text');
const trendText = document.getElementById('trend-type');

let currentPredictionSize = null;
let currentPredictionColor = null;
let currentPredictionNumber = null;
let lastWait = 0;

// Initial Run
renderHistory();
predict();

function addRound(num) {
    const period = periodBox ? periodBox.value : "000";
    const size = num >= 5 ? "BIG" : "SMALL";
    const colors = getColors(num);
    const colorStr = colors.includes('red') ? "RED" : "GREEN";

    // Track if the previous prediction was correct
    let winSize = (currentPredictionSize && size === currentPredictionSize);
    let winColor = (currentPredictionColor && colorStr === currentPredictionColor);
    let winNumber = (currentPredictionNumber !== null && num === currentPredictionNumber);

    // Save prediction for this round record
    history.unshift({
        period,
        number: num,
        size,
        colors,
        winSize: currentPredictionSize ? winSize : null,
        winColor: currentPredictionColor ? winColor : null,
        winNumber: currentPredictionNumber !== null ? winNumber : null,
        predSize: currentPredictionSize,
        predColor: currentPredictionColor,
        predNumber: currentPredictionNumber
    });

    if (history.length > 50) history.pop();
    localStorage.setItem('wg_pro_history', JSON.stringify(history));

    if (periodBox) {
        let nextP = parseInt(period) + 1;
        periodBox.value = nextP;
    }

    renderHistory(); predict();
}

function getColors(n) {
    if (n === 0) return ['red', 'violet'];
    if (n === 5) return ['green', 'violet'];
    return n % 2 === 0 ? ['red'] : ['green'];
}

function aiScoring(history) {
    if (history.length < 10) return { red: 50, green: 50, big: 50, small: 50 };

    const recent = history.slice(0, 50);
    const colors = recent.map(h => h.colors.includes('red') ? "RED" : "GREEN");
    const sizes = recent.map(h => h.size);

    // 1. Skew Analysis (Mean Reversion)
    const redFreq = colors.filter(c => c === "RED").length / colors.length;
    const bigFreq = sizes.filter(s => s === "BIG").length / sizes.length;

    let redProb = 50 + (0.5 - redFreq) * 100; // If red is low, boost it
    let bigProb = 50 + (0.5 - bigFreq) * 100;

    // 2. Correlation (Number to Color)
    const lastNum = history[0].number;
    const historyOfLastNum = recent.filter((h, i) => i > 0 && recent[i - 1].number === lastNum);
    if (historyOfLastNum.length > 0) {
        const nextColAfterNum = historyOfLastNum.map((h, i) => recent[recent.indexOf(h) - 1].colors.includes('red') ? "RED" : "GREEN");
        const redAfterNum = nextColAfterNum.filter(c => c === "RED").length / nextColAfterNum.length;
        redProb = (redProb * 0.7) + (redAfterNum * 100 * 0.3);
    }

    return {
        red: Math.min(95, Math.max(5, redProb)),
        big: Math.min(95, Math.max(5, bigProb))
    };
}

function predict() {
    if (history.length < 5) {
        if (nextDisplay) nextDisplay.innerText = "Minimum 5 rounds chahiye...";
        return;
    }

    const s = history.map(h => h.size);
    const c = history.map(h => h.colors.includes('red') ? "RED" : "GREEN");

    const getStreak = (arr) => {
        let count = 0;
        for (let i = 0; i < arr.length; i++) { if (arr[i] === arr[0]) count++; else break; }
        return count;
    };

    const isZigZag = (arr, n) => {
        if (arr.length < n) return false;
        for (let i = 0; i < n - 1; i++) { if (arr[i] === arr[i + 1]) return false; }
        return true;
    };

    const isMirror = (arr) => {
        if (arr.length < 4) return false;
        return (arr[0] === arr[1] && arr[2] === arr[3] && arr[0] !== arr[2]);
    };

    const ai = aiScoring(history);
    let predSize = s[0], predColor = c[0], confidence = 50, type = "NEUTRAL";

    // --- Decision Engine ---
    const colorStreak = getStreak(c);
    const colorZigZag = isZigZag(c, 4);
    const colorMirror = isMirror(c);

    // Color Logic
    if (colorStreak >= 4) { predColor = c[0]; confidence = 75 + colorStreak; type = "DRAGON"; }
    else if (colorZigZag) { predColor = c[0] === "RED" ? "GREEN" : "RED"; confidence = 82; type = "ZIGZAG"; }
    else if (colorMirror) { predColor = c[0] === "RED" ? "GREEN" : "RED"; confidence = 80; type = "MIRROR"; }
    else {
        predColor = ai.red > 50 ? "RED" : "GREEN";
        confidence = 50 + Math.abs(ai.red - 50);
        type = "AI-SMART";
    }

    // Advanced Size Prediction (BIG/SMALL)
    const sizeStreak = getStreak(s);
    const sizeZigZag = isZigZag(s, 4);
    const sizeMirror = isMirror(s);

    // --- DEEP LOGIC: REVERSE ENGINEERING FACTORS ---

    // 1. Violet Shift (0/5 Logic) - Common trend flipper
    const violetEffect = (s.length > 0 && (history[0].number === 0 || history[0].number === 5));

    // 2. Regression to Mean (Overall Balance - Context from long term history)
    const totalBigGlobal = s.filter(size => size === "BIG").length;
    const sizeSkew = s.length > 10 ? (totalBigGlobal / s.length) : 0.5;

    // 3. Parity Analysis (Odd/Even)
    const isOdd = (num) => num % 2 !== 0;
    const p = history.map(h => isOdd(h.number) ? "ODD" : "EVEN");
    const parityStreak = getStreak(p);

    // 4. Vertical Trap (Search for 3x same number or size in 5 rounds)
    const verticalMatch = (s.length >= 5 && s[0] === s[2] && s[2] === s[4]);
    const numberRepeat = (s.length >= 5 && history[0].number === history[2].number);


    if (sizeStreak >= 8) {
        predSize = s[0] === "BIG" ? "SMALL" : "BIG";
        confidence = 92;
        type = "MEAN-REVERSION";
    }
    else if (violetEffect) {
        // Violet Shift: 0/5 implies a trend break
        predSize = s[0] === "BIG" ? "SMALL" : "BIG";
        confidence = 88;
        type = "VIOLET-SHIFT";
    }
    else if (sizeMirror) {
        predSize = s[0] === "BIG" ? "SMALL" : "BIG";
        confidence = 85;
        type = "MIRROR";
    }
    else if (sizeStreak >= 4) {
        predSize = s[0];
        confidence = 78;
        type = "DRAGON";
    }
    else if (sizeZigZag) {
        predSize = s[0] === "BIG" ? "SMALL" : "BIG";
        confidence = 82;
        type = "ZIGZAG";
    }
    else if (verticalMatch) {
        // Vertical Trap: Predict the OPPOSITE to break the cycle
        predSize = s[0] === "BIG" ? "SMALL" : "BIG";
        confidence = 90;
        type = "VERTICAL-TRAP";
    }
    else if (numberRepeat) {
        // Number Repeat: If a number repeats vertically, high chance of size flip
        predSize = s[0] === "BIG" ? "SMALL" : "BIG";
        confidence = 88;
        type = "PATTERN-BREAK";
    }

    // --- CONFIDENCE SYNERGY (Combining factors) ---
    if (violetEffect && sizeMirror) confidence += 10;
    if (verticalMatch && sizeSkew > 0.6) confidence += 8;
    if (sizeStreak >= 10) confidence = 95;
    if (confidence > 98) confidence = 98;

    else if (sizeSkew > 0.60) {
        // High BIG density -> SMALL is due
        predSize = "SMALL";
        confidence = 80;
        type = "SKEW-CORRECT";
    }
    else if (sizeSkew < 0.40) {
        // High SMALL density -> BIG is due
        predSize = "BIG";
        confidence = 80;
        type = "SKEW-CORRECT";
    }
    else {
        // Default AI Frequency + Parity Pattern Reversion
        if (parityStreak >= 3) {
            predColor = p[0] === "ODD" ? "RED" : "GREEN"; // Balance expected shift
            type = "PARITY-REVERSION";
            confidence = 72;
        } else {
            type = "DEEP-LOGIC";
            confidence = 65 + Math.abs(ai.big - 50);
        }
        predSize = ai.big > 50 ? "BIG" : "SMALL";
    }


    // Final Confidence Tuning
    if (confidence > 98) confidence = 98;
    currentPredictionSize = predSize;
    currentPredictionColor = predColor;

    // Number Saturation & Frequency Analysis
    const nHistory = history.map(h => h.number);
    const numberCounts = Array(10).fill(0);
    const numberLastSeen = Array(10).fill(999);
    for (let i = 0; i <= 9; i++) {
        let idx = nHistory.indexOf(i);
        numberLastSeen[i] = idx === -1 ? 999 : idx;
    }
    nHistory.forEach(num => numberCounts[num]++);

    // Update Hot / Due numbers in UI
    const sortedHot = [...Array(10).keys()].sort((a,b) => numberCounts[b] - numberCounts[a]);
    const sortedDue = [...Array(10).keys()].sort((a,b) => numberLastSeen[b] - numberLastSeen[a]);
    
    const hotEl = document.getElementById('hot-numbers');
    const dueEl = document.getElementById('due-numbers');
    if (hotEl) hotEl.innerText = `${sortedHot[0]}, ${sortedHot[1]}, ${sortedHot[2]}`;
    if (dueEl) dueEl.innerText = `${sortedDue[0]}, ${sortedDue[1]}, ${sortedDue[2]}`;

    // Number Prediction (Based on Size + Color + Saturation)
    const numCandidates = [];
    if (predSize === "BIG") {
        if (predColor === "RED") numCandidates.push(6, 8);
        else if (predColor === "GREEN") numCandidates.push(7, 9);
        else numCandidates.push(5);
    } else {
        if (predColor === "RED") numCandidates.push(2, 4);
        else if (predColor === "GREEN") numCandidates.push(1, 3);
        else numCandidates.push(0);
    }
    
    if (numCandidates.length === 0) {
        if (predSize === "BIG") numCandidates.push(6, 7, 8, 9);
        else numCandidates.push(1, 2, 3, 4);
    }

    // Pick the most DUE number among candidates
    numCandidates.sort((a, b) => numberLastSeen[b] - numberLastSeen[a]);
    currentPredictionNumber = numCandidates[0];

    // Update UI
    const nDisplay = document.getElementById('next-display');
    const nNumber = document.getElementById('next-number');
    const nConf = document.getElementById('next-confidence');

    if (nDisplay) {
        nDisplay.innerText = `${predSize === "BIG" ? "BADA" : "CHOTA"} + ${predColor === "RED" ? "🔴 RED" : "🟢 GREEN"}`;
    }
    if (nNumber) {
        nNumber.innerText = currentPredictionNumber;
    }
    if (nConf) {
        nConf.innerText = `CONFIDENCE: ${confidence}%`;
    }
    nextDisplay.style.color = predColor === "RED" ? "#f43f5e" : "#10b981";

    // AI Badge Update
    const aiBadge = document.getElementById('ai-badge');
    if (aiBadge) {
        if (type.includes("AI-SMART")) {
            aiBadge.style.background = "rgba(16, 185, 129, 0.2)";
            aiBadge.style.borderColor = "#10b981";
            aiBadge.innerHTML = '<span class="pulse" style="background: #10b981;"></span> AI-SMART';
        } else {
            aiBadge.style.background = "rgba(99, 102, 241, 0.2)";
            aiBadge.style.borderColor = "#6366f1";
            aiBadge.innerHTML = '<span class="pulse" style="background: #6366f1;"></span> AI PATTERN';
        }
    }

    if (confFill) confFill.style.width = `${confidence}%`;
    if (confText) confText.innerText = `BHAROSA: ${confidence}%`;
    if (trendText) {
        trendText.innerText = `${type} | ${confidence >= 75 ? "CONFIRMED" : "WATCH"}`;
        trendText.style.color = confidence >= 75 ? "#10b981" : "#f59e0b";
    }
}

function renderHistory() {
    const list = document.getElementById('history-list'); if (!list) return;
    list.innerHTML = "";

    const valid = history.filter(h => h.winSize !== null);

    // Overall Stats
    const sizeWins = valid.filter(h => h.winSize).length;
    const colorWins = valid.filter(h => h.winColor).length;
    const sizeAcc = valid.length ? Math.round((sizeWins / valid.length) * 100) : 0;
    const colorAcc = valid.length ? Math.round((colorWins / valid.length) * 100) : 0;

    // Recent Stats (Last 10 Rounds)
    const recent = valid.slice(0, 10);
    const rSizeWins = recent.filter(h => h.winSize).length;
    const rSizeAcc = recent.length ? Math.round((rSizeWins / recent.length) * 100) : 0;

    // Action Signal Logic (Based on stability in last 6 valid rounds)
    const shortTrend = valid.slice(0, 6);
    const shortWins = shortTrend.filter(h => h.winSize).length;
    let actionText = "⏳ ANALYZING...";
    let actionColor = "#94a3b8";
    let actionDesc = "WAIT FOR MORE DATA";

    if (shortTrend.length >= 6) {
        if (rSizeAcc >= 80 || (valid.length > 0 && valid[0].confidence >= 85)) {
            actionText = "🔥 HIGH PROBABILITY";
            actionColor = "#fbbf24"; // Gold
            actionDesc = "STRONG ALGORITHM MATCH";
        } else if (shortWins >= 5) {
            actionText = "✅ GOOD OPPORTUNITY";
            actionColor = "#4ade80";
            actionDesc = "STABLE PATTERN";
        } else if (shortWins <= 2) {
            actionText = "🔴 STOP / SKIP";
            actionColor = "#f43f5e";
            actionDesc = "RANDOM MODE (RISKY)";
        } else {
            actionText = "🟡 CAUTION";
            actionColor = "#fbbf24";
            actionDesc = "UNSTABLE TREND";
        }
    }

    // Action Signal Dashboard
    const topEl = document.createElement('div');
    topEl.style = `background:${actionColor}22; border:2px solid ${actionColor}; padding:15px; border-radius:15px; margin-bottom:15px; text-align:center; box-shadow:0 0 15px ${actionColor}22;`;
    topEl.innerHTML = `
        <div style="font-size:0.7rem; opacity:0.8; font-weight:900; letter-spacing:1px; margin-bottom:5px; color:${actionColor}">CURRENT ACTION SIGNAL</div>
        <div style="font-size:1.6rem; font-weight:900; color:${actionColor}">${actionText}</div>
        <div style="font-size:0.8rem; font-weight:600; color:${actionColor}; margin-top:5px; opacity:0.9;">${actionDesc}</div>
        <div style="margin-top:10px; font-size:0.6rem; background:rgba(255,255,255,0.1); display:inline-block; padding:2px 8px; border-radius:20px;">
            Recent Accuracy: <b>${rSizeAcc}%</b> (Last 10)
        </div>
    `;
    list.appendChild(topEl);

    // Stats Grid
    const statsEl = document.createElement('div');
    statsEl.style = "display:grid; grid-template-columns: repeat(2, 1fr); gap:6px; background:rgba(255,255,255,0.05); padding:10px; border-radius:12px; margin-bottom:15px; font-size:0.65rem; border: 1px solid rgba(255,255,255,0.1);";
    statsEl.innerHTML = `
        <div style="text-align:center; border-right: 1px solid rgba(255,255,255,0.1);">
            <b>OVERALL SIZE</b><br>
            <span style="color:#10b981; font-size:0.85rem;">${sizeAcc}%</span><br>
            <small style="opacity:0.6">${sizeWins}W | ${valid.length - sizeWins}L</small>
        </div>
        <div style="text-align:center;">
            <b>OVERALL COLOR</b><br>
            <span style="color:#a5b4fc; font-size:0.85rem;">${colorAcc}%</span><br>
            <small style="opacity:0.6">${colorWins}W | ${valid.length - colorWins}L</small>
        </div>
    `;
    list.appendChild(statsEl);

    history.forEach(round => {
        const item = document.createElement('div');
        item.className = 'history-item';
        item.style.display = "flex";
        item.style.alignItems = "center";
        item.style.gap = "8px";

        let colorStyle = round.colors.length > 1 ? `background:linear-gradient(135deg,var(--${round.colors[0]}) 50%,var(--${round.colors[1]}) 50%)` : `background:var(--${round.colors[0]})`;

        // Outcome Tags
        let outcomeTags = "";
        if (round.winSize !== null) {
            outcomeTags = `
                <div style="display:flex; flex-direction:column; gap:2px; margin-left:auto; align-items:flex-end;">
                    <span style="background:${round.winSize ? '#10b981' : '#f43f5e'}; color:#fff; padding:1px 4px; border-radius:3px; font-size:7px; font-weight:900;">S:${round.winSize ? 'W' : 'L'}</span>
                    <span style="background:${round.winColor ? '#6366f1' : '#fb7185'}; color:#fff; padding:1px 4px; border-radius:3px; font-size:7px; font-weight:900;">C:${round.winColor ? 'W' : 'L'}</span>
                </div>
            `;
        }

        item.innerHTML = `
            <div style="width:35px"><span class="h-p">#${round.period}</span></div>
            <div class="h-n" style="${colorStyle}">${round.number}</div>
            <div style="flex:1;"><span class="h-s">${round.size}</span></div>
            ${outcomeTags}
        `;
        list.appendChild(item);
    });
}

function resetSession() {
    if (confirm("Reset current session stats?")) {
        history = [];
        localStorage.removeItem('wg_pro_history');
        renderHistory();
        alert("Session Reset!");
    }
}

// ===========================
// ⚡ REAL-TIME JALWA CONNECT
// ===========================
const API_URLS = [
    'https://api.jalwaapi.com/api/webapi',
    'https://h5.ar-lottery06.com/api',
    'https://h5.ar-lottery01.com/api',
    'https://h5.ar-lottery01.com/api/webapi',
    'https://h5.ar-lottery07.com/api',
    'https://www.a7jalx9.com/api',
    'https://api.a7jalx9.com/api'
];

const ENDPOINTS = {
    login: '/Login',
    history: '/GetNoaverageEmerdList'
};

const PROXIES = [
    '', // Direct fetch (Works with CORS Extension)
    'https://api.allorigins.win/get?url=',
    'https://cors-anywhere.herokuapp.com/',
    'https://corsproxy.io/?url='
];

function setBadge(connected, label) {
    const b = document.getElementById('login-badge'); if (!b) return;
    b.style.background = connected ? 'rgba(16,185,129,0.2)' : 'rgba(244,63,94,0.2)';
    b.style.color = connected ? '#10b981' : '#f43f5e';
    b.innerText = connected ? '✅ CONNECTED' : (label || '❌ NOT CONNECTED');
}

function setStatus(msg, color) {
    const el = document.getElementById('fetch-status'); if (el) { el.style.color = color || '#94a3b8'; el.innerText = msg; }
}

async function jalwaLogin() {
    const phoneEl = document.getElementById('jalwa-phone');
    const passEl = document.getElementById('jalwa-pass');
    if (!phoneEl || !passEl) return;
    const phone = phoneEl.value.trim();
    const pass = passEl.value.trim();
    if (!phone || !pass) return;

    setBadge(false, '⏳ CONNECTING...');
    const loginName = (phone.length === 10) ? '91' + phone : phone;

    async function tryOne(proxy, baseUrl) {
        const fullUrl = baseUrl + ENDPOINTS.login;
        let target = proxy ? (proxy.includes('allorigins') ? proxy + encodeURIComponent(fullUrl) : proxy + fullUrl) : fullUrl;

        try {
            setStatus(`Checking ${baseUrl.split('//')[1]}...`, '#a5b4fc');
            const res = await fetch(target, {
                method: (proxy && proxy.includes('allorigins')) ? 'GET' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: (proxy && proxy.includes('allorigins')) ? null : JSON.stringify({ loginName, loginPassword: pass, loginType: 0 })
            });

            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            let d = await res.json();
            if (proxy && proxy.includes('allorigins') && d.contents) d = JSON.parse(d.contents);

            if (d?.data?.token) {
                localStorage.setItem('jalwa_token', d.data.token);
                localStorage.setItem('jalwa_api_base', baseUrl);
                localStorage.setItem('jalwa_phone', phone);
                return d.data.token;
            } else if (d?.msg) {
                throw new Error(d.msg);
            }
        } catch (e) {
            console.error("Login Error:", e);
            if (!proxy) console.log("Direct connection blocked by browser/CORS");
        }
        return null;
    }

    for (let proxy of PROXIES) {
        for (let baseUrl of API_URLS) {
            const tok = await tryOne(proxy, baseUrl);
            if (tok) {
                setBadge(true); setStatus('✅ Login Success! Syncing...', '#10b981');
                return jalwaFetch();
            }
        }
    }
    setBadge(false, '❌ FAILED');
    setStatus('⚠️ Kisi server ne response nahi diya. (Hint: PC Extension check karein ya Manual Token use karein)', '#f43f5e');
}

async function jalwaFetch() {
    const token = localStorage.getItem('jalwa_token');
    if (!token) return;

    setStatus('⏳ Syncing history...', '#a5b4fc');

    for (let apiBase of API_URLS) {
        const url = apiBase + ENDPOINTS.history;
        const body = { typeId: 1, pageNo: 1, pageSize: 30 };

        for (let proxy of PROXIES) {
            try {
                let target = proxy ? (proxy.includes('allorigins') ? proxy + encodeURIComponent(url) : proxy + url) : url;
                const res = await fetch(target, {
                    method: proxy.includes('allorigins') ? 'GET' : 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + token
                    },
                    body: proxy.includes('allorigins') ? null : JSON.stringify(body)
                });

                if (!res.ok) continue;

                let d = await res.json();
                if (proxy.includes('allorigins') && d.contents) d = JSON.parse(d.contents);

                if (d?.data?.list) {
                    const list = d.data.list;
                    history = list.map(r => ({
                        period: String(r.issueNumber || r.period).slice(-3),
                        number: parseInt(r.number),
                        size: (parseInt(r.number) >= 5 ? 'BIG' : 'SMALL'),
                        colors: getColors(parseInt(r.number)),
                        winSize: null, winColor: null
                    }));
                    localStorage.setItem('wg_pro_history', JSON.stringify(history));
                    localStorage.setItem('jalwa_api_base', apiBase);
                    if (periodBox) periodBox.value = parseInt(String(list[0].period).slice(-3)) + 1;
                    renderHistory(); predict(); setBadge(true);
                    setStatus(`✅ ${list.length} rounds sync! #${periodBox.value}`, '#10b981');
                    return;
                }
            } catch (e) { console.error("Fetch Error:", e); }
        }
    }
    setStatus('⚠️ Sync failed. Try Refresh or new token.', '#f43f5e');
}

// MANUAL TOKEN FUNCTIONS
function saveManualToken() {
    const tok = document.getElementById('manual-token').value.trim();
    if (!tok) return;
    localStorage.setItem('jalwa_token', tok);
    setBadge(true);
    setStatus('✅ Token Saved! Refresh karke sync karein.', '#10b981');
    jalwaFetch();
}

function copyTokenScript() {
    const script = 'javascript:alert(localStorage.getItem("token"))';
    navigator.clipboard.writeText(script).then(() => {
        setStatus('📋 Script Copied! Jalwa site par paste karein.', '#10b981');
    }).catch(err => {
        const t = document.createElement("textarea"); t.value = script; document.body.appendChild(t); t.select(); document.execCommand('copy'); document.body.removeChild(t);
        setStatus('📋 Script Copied!', '#10b981');
    });
}

function masterImport() {
    const input = document.getElementById('master-input').value.trim();
    if (!input) { setStatus('⚠️ Please enter numbers!', '#f43f5e'); return; }

    const rawNums = input.split(/[,\s\n]+/).map(n => parseInt(n.trim())).filter(n => !isNaN(n));
    if (rawNums.length === 0) return;

    // Use value from period box as the "Current Period"
    let basePeriod = parseInt(periodBox.value) || 123;

    // We assume the numbers entered are Newest to Oldest
    history = rawNums.map((num, i) => {
        const p = basePeriod - (i + 1); // Current period is N, latest history is N-1
        return {
            period: String(p).padStart(3, '0').slice(-3),
            number: num,
            size: num >= 5 ? 'BIG' : 'SMALL',
            colors: getColors(num),
            winSize: null, // We don't know old predictions
            winColor: null
        };
    });

    localStorage.setItem('wg_pro_history', JSON.stringify(history));
    renderHistory(); predict();
    setStatus(`✅ Imported ${rawNums.length} rounds!`, '#10b981');
    document.getElementById('master-import').style.display = 'none';
}

window.addEventListener('DOMContentLoaded', () => {
    const tok = localStorage.getItem('jalwa_token'); if (tok) setBadge(true);
    const savedPhone = localStorage.getItem('jalwa_phone'); if (savedPhone) {
        const pInput = document.getElementById('jalwa-phone');
        if (pInput) pInput.value = savedPhone;
    }
});
