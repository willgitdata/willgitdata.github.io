// One local-calendar day per mountain; continuous 30-day cycle, not day-of-month.
(function () {
  var mountains = [
    ['denali', 'Denali', 'Alaska Range'],
    ['fuji', 'Mount Fuji', 'Japan'],
    ['matterhorn', 'Matterhorn', 'Switzerland / Italy'],
    ['everest', 'Mount Everest', 'Nepal / China'],
    ['kilimanjaro', 'Kilimanjaro', 'Tanzania'],
    ['k2', 'K2', 'Pakistan / China'],
    ['mont-blanc', 'Mont Blanc', 'France / Italy'],
    ['fitz-roy', 'Fitz Roy', 'Patagonia'],
    ['cerro-torre', 'Cerro Torre', 'Patagonia'],
    ['ama-dablam', 'Ama Dablam', 'Nepal'],
    ['rainier', 'Mount Rainier', 'Washington'],
    ['whitney', 'Mount Whitney', 'California'],
    ['el-capitan', 'El Capitan', 'Yosemite'],
    ['half-dome', 'Half Dome', 'Yosemite'],
    ['aconcagua', 'Aconcagua', 'Argentina'],
    ['annapurna', 'Annapurna', 'Nepal'],
    ['dhaulagiri', 'Dhaulagiri', 'Nepal'],
    ['kangchenjunga', 'Kangchenjunga', 'Nepal / India'],
    ['nanga-parbat', 'Nanga Parbat', 'Pakistan'],
    ['aoraki', 'Aoraki / Mount Cook', 'New Zealand'],
    ['mount-kenya', 'Mount Kenya', 'Kenya'],
    ['table-mountain', 'Table Mountain', 'South Africa'],
    ['eiger', 'Eiger', 'Switzerland'],
    ['machapuchare', 'Machapuchare', 'Nepal'],
    ['alpamayo', 'Alpamayo', 'Peru'],
    ['vesuvius', 'Mount Vesuvius', 'Italy'],
    ['etna', 'Mount Etna', 'Italy'],
    ['olympus', 'Mount Olympus', 'Greece'],
    ['roraima', 'Mount Roraima', 'Guiana Highlands'],
    ['assiniboine', 'Mount Assiniboine', 'Canadian Rockies']
  ];
  var image = document.querySelector('.hero-art img');
  var caption = document.getElementById('mountain-name');
  if (!image || !caption) return;
  var timer;
  function update() {
    var now = new Date();
    // UTC arithmetic on local date fields avoids DST's 23/25-hour days.
    var day = Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(2026, 10, 9)) / 86400000);
    var mountain = mountains[((day % mountains.length) + mountains.length) % mountains.length];
    var src = mountain[0] === 'denali' ? 'assets/ink/denali-sketch.webp' : 'assets/ink/mountains/' + mountain[0] + '.webp';
    var next = new Image();
    next.onload = function () {
      image.src = src;
      image.alt = 'Blue-pen-style illustration of ' + mountain[1] + '.';
      image.dataset.mountain = mountain[0];
      caption.textContent = mountain[1] + ' · ' + mountain[2];
    };
    // Keep the working Denali image and caption if today's file cannot load.
    next.src = src;
    clearTimeout(timer);
    timer = setTimeout(update, new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now + 50);
  }
  update();
  document.addEventListener('visibilitychange', function () { if (!document.hidden) update(); });
})();
