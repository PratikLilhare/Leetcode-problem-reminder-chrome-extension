let iframeVisible = false;

function createIframe() {
  const iframe = document.createElement('iframe');
  iframe.id = 'lc-reminder-iframe';
  const currentUrl = encodeURIComponent(window.location.href);
  iframe.src = chrome.runtime.getURL(`popup.html?url=${currentUrl}`);
  document.body.appendChild(iframe);
  return iframe;
}

function updateBadge(problems) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();

  let todayCount = 0;
  let backlogCount = 0;

  problems.filter(p => !p.completed).forEach(p => {
    const pDate = new Date(p.remindOn);
    pDate.setHours(0, 0, 0, 0);
    const pMs = pDate.getTime();

    if (pMs === todayMs) {
      todayCount++;
    } else if (pMs < todayMs) {
      backlogCount++;
    }
  });

  // Find or create the FAB
  let fab = document.getElementById('lc-reminder-fab');
  if (!fab) {
    fab = document.createElement('div');
    fab.id = 'lc-reminder-fab';
    
    // Add icon SVG
    fab.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/></svg>`;
    
    fab.addEventListener('click', toggleIframe);
    document.body.appendChild(fab);
  }

  // Handle badges inside FAB
  let todayBadge = fab.querySelector('.lc-badge.today');
  let backlogBadge = fab.querySelector('.lc-badge.backlog');

  if (todayCount > 0) {
    if (!todayBadge) {
      todayBadge = document.createElement('div');
      todayBadge.className = 'lc-badge today';
      fab.appendChild(todayBadge);
    }
    todayBadge.textContent = todayCount > 99 ? '99+' : todayCount;
  } else if (todayBadge) {
    todayBadge.remove();
  }

  if (backlogCount > 0) {
    if (!backlogBadge) {
      backlogBadge = document.createElement('div');
      backlogBadge.className = 'lc-badge backlog';
      fab.appendChild(backlogBadge);
    }
    backlogBadge.textContent = backlogCount > 99 ? '99+' : backlogCount;
  } else if (backlogBadge) {
    backlogBadge.remove();
  }
}

function toggleIframe() {
  let iframe = document.getElementById('lc-reminder-iframe');
  if (!iframe) {
    iframe = createIframe();
  }
  
  let backdrop = document.getElementById('lc-reminder-backdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'lc-reminder-backdrop';
    backdrop.addEventListener('click', toggleIframe);
    document.body.appendChild(backdrop);
  }

  let closeFab = document.getElementById('lc-reminder-close-fab');
  if (!closeFab) {
    closeFab = document.createElement('div');
    closeFab.id = 'lc-reminder-close-fab';
    closeFab.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;
    closeFab.addEventListener('click', toggleIframe);
    document.body.appendChild(closeFab);
  }
  
  iframeVisible = !iframeVisible;
  if (iframeVisible) {
    iframe.classList.add('visible');
    backdrop.classList.add('visible');
    closeFab.classList.add('visible');
    iframe.contentWindow.postMessage({ action: 'setLcUrl', url: window.location.href }, '*');
  } else {
    iframe.classList.remove('visible');
    backdrop.classList.remove('visible');
    closeFab.classList.remove('visible');
  }
}

// Initial load
chrome.storage.local.get(['leetcodeProblems'], (result) => {
  if (result.leetcodeProblems) {
    updateBadge(result.leetcodeProblems);
  } else {
    updateBadge([]);
  }
});

// Listen for changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.leetcodeProblems) {
    updateBadge(changes.leetcodeProblems.newValue || []);
  }
});

// Listen for messages from iframe
window.addEventListener('message', (event) => {
  if (event.data) {
    if (event.data.action === 'closeLcReminder') {
      if (iframeVisible) toggleIframe();
    } else if (event.data.action === 'getLcUrl') {
      let iframe = document.getElementById('lc-reminder-iframe');
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({ action: 'setLcUrl', url: window.location.href }, '*');
      }
    }
  }
});
