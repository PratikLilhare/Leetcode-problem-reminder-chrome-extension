document.addEventListener('DOMContentLoaded', () => {
  const SPACING_INTERVALS = [1, 4, 15, 30];

  const isEmbedded = window.self !== window.top;

  // Elements
  const form = document.getElementById('add-problem-form');
  const nameInput = document.getElementById('problem-name');
  const daysInput = document.getElementById('remind-days');
  const tabs = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  const listToday = document.getElementById('list-today');
  const listUpcoming = document.getElementById('list-upcoming');
  const listBacklog = document.getElementById('list-backlog');

  const countToday = document.getElementById('today-count');
  const countUpcoming = document.getElementById('upcoming-count');
  const countBacklog = document.getElementById('backlog-count');

  const exportBtn = document.getElementById('export-btn');

  // Autofill URL from parent content script when embedded
  if (isEmbedded) {
    // 1. Try reading from URL parameters first (fastest for initial load)
    const urlParams = new URLSearchParams(window.location.search);
    const passedUrl = urlParams.get('url');
    const passedTitle = urlParams.get('title');
    if (passedUrl && passedUrl.includes('/problems/')) {
      if (!nameInput.value) {
        form.dataset.autoUrl = passedUrl;
        nameInput.value = passedTitle || passedUrl;
      }
    }

    // 2. Listen for URL updates via postMessage (for SPA navigation)
    window.addEventListener('message', (event) => {
      if (event.data && event.data.action === 'setLcUrl') {
        const url = event.data.url;
        const title = event.data.title;
        if (url && url.includes('/problems/')) {
          if (!nameInput.value || nameInput.value === form.dataset.autoTitle || nameInput.value === form.dataset.autoUrl) {
            form.dataset.autoUrl = url;
            form.dataset.autoTitle = title || url;
            nameInput.value = title || url;
          }
        }
      }
    });

    // Request URL from parent when loaded
    window.parent.postMessage({ action: 'getLcUrl' }, '*');
  } else {
    // Autofill when opened from browser toolbar
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (tab && tab.url && tab.url.includes('/problems/')) {
        if (!nameInput.value) {
          form.dataset.autoUrl = tab.url;
          nameInput.value = tab.title || tab.url;
        }
      }
    });
  }

  // State
  let problems = [];

  // Initialize
  loadProblems();



  // Tab Switching Logic
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Remove active classes
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      // Add active class to clicked tab
      tab.classList.add('active');
      const targetId = `tab-${tab.dataset.tab}`;
      document.getElementById(targetId).classList.add('active');
    });
  });

  // Form Submit
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = nameInput.value.trim();
    const days = parseInt(daysInput.value, 10);

    if (!title || isNaN(days)) return;

    let url = null;
    let finalTitle = title;

    if (form.dataset.autoUrl) {
      url = form.dataset.autoUrl;
      finalTitle = title;
      delete form.dataset.autoUrl;
      delete form.dataset.autoTitle;
    } else if (title.startsWith('http')) {
      url = title;
      try {
        const urlObj = new URL(title);
        // Extract problem name from URL if possible
        if (urlObj.hostname.includes('leetcode.com') || urlObj.hostname.includes('geeksforgeeks.org') || urlObj.hostname.includes('neetcode.io')) {
          const pathParts = urlObj.pathname.split('/').filter(p => p);
          const problemIndex = pathParts.findIndex(p => p === 'problems');
          if (problemIndex !== -1 && pathParts[problemIndex + 1]) {
            finalTitle = pathParts[problemIndex + 1].split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          }
        }
      } catch (e) {
        // Ignore URL parsing errors
      }
    }

    // Calculate remind date
    const today = new Date();
    today.setHours(0, 0, 0, 0); // reset time
    const remindDate = new Date(today);
    remindDate.setDate(remindDate.getDate() + days);

    let stage = 0;
    if (form.dataset.pendingStage) {
      stage = parseInt(form.dataset.pendingStage, 10);
      delete form.dataset.pendingStage;
    }

    const newProblem = {
      id: Date.now().toString(),
      title: finalTitle,
      url: url,
      remindOn: remindDate.toISOString(),
      createdAt: new Date().toISOString(),
      completed: false,
      stage: stage
    };

    problems.push(newProblem);
    saveProblems();

    // Reset form
    nameInput.value = '';
    daysInput.value = '1';

    renderAll();
  });

  if (exportBtn) {
    exportBtn.addEventListener('click', exportToCSV);
  }

  // Helper functions
  function loadProblems() {
    chrome.storage.local.get(['leetcodeProblems'], (result) => {
      if (result.leetcodeProblems) {
        problems = result.leetcodeProblems;
      }
      renderAll();
    });
  }

  function saveProblems() {
    if (problems.length > 5000) {
      const completed = problems.filter(p => p.completed).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      const active = problems.filter(p => !p.completed).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      const keptActive = active.slice(0, 5000);
      const keptCompleted = completed.slice(0, Math.max(0, 5000 - keptActive.length));
      problems = [...keptActive, ...keptCompleted];
    }
    chrome.storage.local.set({ leetcodeProblems: problems });
  }

  function renderAll() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();

    const lists = {
      today: [],
      upcoming: [],
      backlog: []
    };

    problems.filter(p => !p.completed).forEach(p => {
      const pDate = new Date(p.remindOn);
      pDate.setHours(0, 0, 0, 0);
      const pMs = pDate.getTime();

      if (pMs === todayMs) {
        lists.today.push(p);
      } else if (pMs > todayMs) {
        lists.upcoming.push(p);
      } else {
        lists.backlog.push(p);
      }
    });

    // Update counts
    countToday.textContent = lists.today.length;
    countUpcoming.textContent = lists.upcoming.length;
    countBacklog.textContent = lists.backlog.length;

    // Render lists
    renderList(listToday, lists.today, 'today');
    renderList(listUpcoming, lists.upcoming, 'upcoming');
    renderList(listBacklog, lists.backlog, 'backlog');
  }

  function renderList(container, items, type) {
    container.innerHTML = '';

    if (items.length === 0) {
      container.innerHTML = `<div class="empty-state">No problems..</div>`;
      return;
    }

    // Sort: backlog by oldest first, upcoming by nearest first
    items.sort((a, b) => new Date(a.remindOn).getTime() - new Date(b.remindOn).getTime());

    items.forEach(p => {
      const li = document.createElement('li');
      li.className = 'problem-item';

      const pDate = new Date(p.remindOn);
      const dateStr = pDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

      let titleHtml = p.url
        ? `<a href="${p.url}" target="_blank" rel="noopener noreferrer">${escapeHtml(p.title)}</a>`
        : escapeHtml(p.title);

      let nextInterval = SPACING_INTERVALS[1]; // default 4
      let stage = p.stage !== undefined ? p.stage : 0;
      if (stage < SPACING_INTERVALS.length - 1) {
        nextInterval = SPACING_INTERVALS[stage + 1];
      } else {
        nextInterval = SPACING_INTERVALS[SPACING_INTERVALS.length - 1]; // Cap at 30
      }

      li.innerHTML = `
        <div class="problem-info">
          <div class="problem-title" title="${escapeHtml(p.title)}">${titleHtml}</div>
          <div class="problem-meta">
            <span class="status-dot ${type}"></span>
            Due: ${dateStr}
          </div>
        </div>
        <div class="btn-group">
          <button class="btn-icon btn-review" data-id="${p.id}" title="Review Again (in ${nextInterval} days)">
            <svg width="18" height="18" viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg" style="fill: white; stroke: none;"><path d="M25 38c-7.2 0-13-5.8-13-13 0-3.2 1.2-6.2 3.3-8.6l1.5 1.3C15 19.7 14 22.3 14 25c0 6.1 4.9 11 11 11 1.6 0 3.1-.3 4.6-1l.8 1.8c-1.7.8-3.5 1.2-5.4 1.2z"/><path d="M34.7 33.7l-1.5-1.3c1.8-2 2.8-4.6 2.8-7.3 0-6.1-4.9-11-11-11-1.6 0-3.1.3-4.6 1l-.8-1.8c1.7-.8 3.5-1.2 5.4-1.2 7.2 0 13 5.8 13 13 0 3.1-1.2 6.2-3.3 8.6z"/><path d="M18 24h-2v-6h-6v-2h8z"/><path d="M40 34h-8v-8h2v6h6z"/></svg>
          </button>
          <button class="btn-icon btn-mastered" data-id="${p.id}" title="Mastered (Remove)">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
          </button>
        </div>
      `;

      // Event listener for review button
      li.querySelector('.btn-review').addEventListener('click', () => {
        reviewAgain(p.id);
      });

      // Event listener for mastered button
      li.querySelector('.btn-mastered').addEventListener('click', () => {
        markAsMastered(p.id);
      });

      container.appendChild(li);
    });
  }

  function reviewAgain(id) {
    const index = problems.findIndex(p => p.id === id);
    if (index !== -1) {
      let p = problems[index];
      if (p.stage === undefined) p.stage = 0;

      let nextStage = p.stage;
      if (nextStage < SPACING_INTERVALS.length - 1) {
        nextStage += 1;
      }

      const interval = SPACING_INTERVALS[nextStage];

      // Populate inputs
      const nameInput = document.getElementById('problem-name');
      const daysInput = document.getElementById('remind-days');

      nameInput.value = p.url || p.title;
      daysInput.value = interval;

      // Preserve stage for the new addition
      const form = document.getElementById('add-problem-form');
      form.dataset.pendingStage = nextStage;

      // Delete the problem so user can manually re-add it
      problems.splice(index, 1);
      saveProblems();
      renderAll();

      // Focus the days input so user can change it immediately if they want
      daysInput.focus();
    }
  }

  function markAsMastered(id) {
    const index = problems.findIndex(p => p.id === id);
    if (index !== -1) {
      problems[index].completed = true;
      saveProblems();
      renderAll();
    }
  }

  function escapeHtml(unsafe) {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function exportToCSV() {
    if (problems.length === 0) {
      alert("No data to export.");
      return;
    }

    const headers = ['ID', 'Title', 'URL', 'Remind On', 'Created At', 'Completed', 'Stage'];
    
    const rows = problems.map(p => {
      const title = p.title ? p.title.replace(/"/g, '""') : '';
      return [
        p.id,
        `"${title}"`,
        p.url || '',
        new Date(p.remindOn).toLocaleDateString(),
        new Date(p.createdAt).toLocaleDateString(),
        p.completed ? 'Yes' : 'No',
        p.stage || 0
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `lc_reminder_data_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
});
