const menuToggle = document.getElementById('menuToggle');
    const mobileMenu = document.getElementById('mobileMenu');
    function setMenuOpen(isOpen) {
      mobileMenu.classList.toggle('is-open', isOpen);
      menuToggle.setAttribute('aria-expanded', String(isOpen));
      menuToggle.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
    }
    menuToggle.addEventListener('click', () => setMenuOpen(menuToggle.getAttribute('aria-expanded') !== 'true'));
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') setMenuOpen(false); });
    document.addEventListener('click', (event) => {
      if (!event.target.closest('.site-header')) setMenuOpen(false);
    });