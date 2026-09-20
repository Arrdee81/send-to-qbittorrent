// Category picker — shown before EVERY add. Chosen over a second "…(VR)" context
// menu entry because a forgotten menu click silently mis-files a torrent; here the
// choice cannot be skipped. Closing the window (Cancel/Esc/X) sends nothing at all.
const params = new URLSearchParams(location.search);
const pendingId = params.get('id');

const select = document.getElementById('category');
const textInput = document.getElementById('categoryText');
const savepath = document.getElementById('savepath');
const errorBox = document.getElementById('error');
const addButton = document.getElementById('add');

let paths = {};        // category name -> savePath, for the hint line
let freeText = false;  // true once the category list can't be fetched

document.getElementById('target').textContent = params.get('label') || '';

function showError(message) {
  errorBox.textContent = message;
  errorBox.style.display = 'block';
}

function currentCategory() {
  return (freeText ? textInput.value : select.value).trim();
}

function updateSavePath() {
  const name = currentCategory();
  savepath.textContent = name ? (paths[name] || '') : '(no category)';
}

async function loadCategories() {
  let response;
  try {
    response = await browser.runtime.sendMessage({ action: 'qbCategories' });
  } catch (e) {
    response = { ok: false, error: String(e && e.message || e) };
  }
  if (!response || !response.ok) {
    // Fall back to typing a name rather than blocking the send outright.
    freeText = true;
    select.style.display = 'none';
    textInput.style.display = 'block';
    showError(`Couldn't read categories: ${(response && response.error) || 'no reply'}`);
    textInput.focus();
    return;
  }

  const categories = response.categories || {};
  const names = Object.keys(categories).sort((a, b) => a.localeCompare(b));
  for (const name of names) {
    paths[name] = (categories[name] && categories[name].savePath) || '';
  }

  const none = document.createElement('option');
  none.value = '';
  none.textContent = '— no category —';
  select.appendChild(none);
  for (const name of names) {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    option.title = paths[name];
    select.appendChild(option);
  }

  // Preselect the last category used — still one deliberate click to confirm.
  const { lastCategory } = await browser.storage.local.get('lastCategory');
  if (lastCategory && names.includes(lastCategory)) select.value = lastCategory;

  updateSavePath();
  select.focus();
}

async function submit() {
  if (!pendingId) return window.close();
  const category = currentCategory();
  addButton.disabled = true;
  try {
    await browser.storage.local.set({ lastCategory: category });
    await browser.runtime.sendMessage({ action: 'qbPickerSubmit', id: pendingId, category });
  } catch (e) {
    addButton.disabled = false;
    showError('Background script did not answer — nothing was sent.');
    return;
  }
  window.close();
}

select.addEventListener('change', updateSavePath);
textInput.addEventListener('input', updateSavePath);
addButton.addEventListener('click', submit);
document.getElementById('cancel').addEventListener('click', () => window.close());
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') submit();
  if (e.key === 'Escape') window.close();
});

browser.storage.local.get('darkMode').then(({ darkMode }) => {
  if (!darkMode) return;
  document.body.classList.add('dark-mode-body');
  document.querySelectorAll('select, input, button')
    .forEach((el) => el.classList.add('dark-mode-others'));
});

loadCategories();
