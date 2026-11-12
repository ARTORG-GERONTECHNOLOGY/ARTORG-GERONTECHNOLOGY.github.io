/* Accessible enhancement of the ordinary navigation links using Bootstrap 3. */
(function ($) {
  'use strict';
  $(function () {
    var menu = $('#primary-navigation');
    var toggle = $('#navigation-toggle');
    if (!menu.length || !toggle.length || !$.fn.collapse) return;

    menu.addClass('collapse').collapse({toggle: false});
    toggle.prop('hidden', false);
    function expanded(open) {
      toggle.attr('aria-expanded', String(open));
      toggle.find('.navigation-action').text(open ? 'Close menu' : 'Menu');
    }
    menu.on('show.bs.collapse', function () { expanded(true); });
    menu.on('hide.bs.collapse', function () {
      expanded(false);
      if (menu[0].contains(document.activeElement)) toggle[0].focus();
    });
    $(document).on('keydown', function (event) {
      if (event.key === 'Escape' && menu.hasClass('in') && window.matchMedia('(max-width: 1023px)').matches) {
        menu.collapse('hide');
        toggle[0].focus();
      }
    });
  });
}(window.jQuery));
