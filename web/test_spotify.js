fetch('https://open.spotify.com/episode/5NjJAcE3f0DBP5bkJIdwUF', {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  }
}).then(r => r.text()).then(t => console.log(t.includes('og:title')));
