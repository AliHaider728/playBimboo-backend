
fetch('http://localhost:5000/api/coupons/validate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ code: 'BIMBOOO3', cartSubtotal: 100 })
}).then(r => r.json()).then(console.log).catch(console.error);

