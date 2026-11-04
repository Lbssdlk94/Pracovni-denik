// Pracovní deník – prezentační web
// Drobné interakce optimalizované pro dotykové displeje (iPhone)

document.addEventListener('DOMContentLoaded', () => {
  // Plynulé scrollování už řeší CSS (scroll-behavior: smooth),
  // tady jen vylepšíme odezvu tlačítek.

  const buttons = document.querySelectorAll('.btn');
  buttons.forEach(btn => {
    btn.addEventListener('touchstart', () => {
      btn.style.opacity = '0.85';
    }, { passive: true });
    btn.addEventListener('touchend', () => {
      btn.style.opacity = '';
    });
  });

  // Jednoduchý výpočet: kolik dní zbývá do konce měsíce
  const now = new Date();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const remaining = endOfMonth - now.getDate();
  const footer = document.querySelector('footer p');
  if (footer) {
    footer.textContent += ` · Do konce měsíce zbývá ${remaining} dní na zapsání práce.`;
  }
});
