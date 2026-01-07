<!-- ZebKit - Paste this just before </body> on the host page -->
<script>
(function(){
  // Guard: não instalar duas vezes
  if (window.__nebula_zebkit_installed) {
    console.warn('ZebKit já instalado');
    return;
  }
  window.__nebula_zebkit_installed = true;

  /**
   * ZebKit - Minimal host helper for NEBULA iframe
   * - coloca em window.ZebKit
   * - responde a postMessage do iframe
   *
   * ATENÇÃO:
   * - Use apenas em páginas de confiança (o script injeta estilos / lê DOM)
   * - Em produção, considere validar origem antes de responder postMessage
   */

  const ZebKit = {
    // Escaneia botões e elementos similares no root (document.body por padrão)
    getButtons(root = document.body) {
      const selector = [
        'button',
        '[role="button"]',
        'input[type="button"]',
        'input[type="submit"]',
        'a[role="button"]',
        'a[href][data-button]',
        '[data-nebula-button]'
      ].join(',');
      const nodes = Array.from((root || document.body).querySelectorAll(selector));

      return nodes.map((el, i) => {
        // garante id único
        if(!el.id) {
          el.id = 'zeb-btn-' + (Date.now().toString(36)) + '-' + i;
        }
        const rect = el.getBoundingClientRect();
        return {
          id: el.id,
          tag: el.tagName.toLowerCase(),
          text: (el.innerText || el.value || el.getAttribute('aria-label') || '').trim(),
          classes: el.className || '',
          dataset: {...el.dataset},
          bounding: {
            x: Math.round(rect.x), y: Math.round(rect.y),
            left: Math.round(rect.left), top: Math.round(rect.top),
            width: Math.round(rect.width), height: Math.round(rect.height),
            right: Math.round(rect.right), bottom: Math.round(rect.bottom)
          },
          visible: !!(rect.width || rect.height),
          tabIndex: el.tabIndex
        };
      });
    },

    // Agrupa a lista por classes (cada classe vira um grupo). Também popula __ungrouped
    groupByClass(list = []) {
      const groups = {};
      list.forEach(item => {
        const clsArr = (item.classes || '').split(/\s+/).filter(Boolean);
        if(clsArr.length === 0) {
          groups.__ungrouped = groups.__ungrouped || [];
          groups.__ungrouped.push(item);
        } else {
          clsArr.forEach(c => {
            groups[c] = groups[c] || [];
            groups[c].push(item);
          });
        }
      });
      return groups;
    },

    // Destaque visual temporário e scrollIntoView
    highlightElement(id, opts = {}) {
      try {
        const el = document.getElementById(id);
        if(!el) return false;
        const prevOutline = el.style.outline;
        const prevZ = el.style.zIndex;
        el.style.outline = opts.outline || '3px dashed rgba(0,242,255,0.95)';
        el.style.zIndex = (opts.zIndex || 9999);
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => {
          el.style.outline = prevOutline || '';
          el.style.zIndex = prevZ || '';
        }, opts.duration || 1500);
        return true;
      } catch (e) { return false; }
    },

    // Aplica estilos inline simples (styles: object com camelCase ou prop string)
    applyStyles(id, styles = {}) {
      try {
        const el = document.getElementById(id);
        if(!el) return false;
        Object.keys(styles).forEach(k => {
          try { el.style[k] = styles[k]; } catch(err) { /* ignore invalid props */ }
        });
        return true;
      } catch(e) { return false; }
    },

    // Injeta/atualiza tag <style> no head (retorna tagId)
    injectCss(content = '', fileId) {
      try {
        const tagId = 'zebkit-css-' + (fileId || Date.now().toString(36));
        let styleTag = document.getElementById(tagId);
        if(!styleTag) {
          styleTag = document.createElement('style');
          styleTag.id = tagId;
          document.head.appendChild(styleTag);
        }
        styleTag.textContent = content || '';
        return tagId;
      } catch(e) {
        console.warn('ZebKit.injectCss erro', e);
        return null;
      }
    },

    // Utility: retorna node por id (undefined se não existir)
    node(id) { return document.getElementById(id); }
  };

  // Expor ZebKit
  window.ZebKit = ZebKit;
  console.info('%cZebKit instalado — responderá a NEBULA_SCAN_REQ', 'color:#0ff; background:#001; padding:3px');

  // Mensageiro: responde às requisições do iframe
  window.addEventListener('message', function(ev){
    // ev.origin pode ser checado aqui para segurança, ex:
    // if(ev.origin !== 'https://seu-iframe-origin.com') return;

    try {
      const d = ev.data || {};
      if(!d || !d.type) return;

      // SCAN REQ: retorna lista de botões + groups
      if(d.type === 'NEBULA_SCAN_REQ') {
        const tree = ZebKit.getButtons(document.body);
        const groups = ZebKit.groupByClass(tree);
        // Enviar resposta para a origem do pedido
        try {
          (ev.source || window).postMessage({ type: 'NEBULA_SCAN_RES', tree, groups }, ev.origin || '*');
        } catch(e) {
          // fallback
          window.postMessage({ type: 'NEBULA_SCAN_RES', tree, groups }, '*');
        }
      }

      // HIGHLIGHT
      if(d.type === 'NEBULA_HIGHLIGHT') {
        const ok = ZebKit.highlightElement(d.id, { outline: '3px dashed #00f2ff', duration: 1600 });
        try { (ev.source || window).postMessage({ type: 'NEBULA_HIGHLIGHT_ACK', id: d.id, ok }, ev.origin || '*'); } catch(e){}
      }

      // UPDATE inline styles
      if(d.type === 'NEBULA_UPDATE_STYLE') {
        const ok = ZebKit.applyStyles(d.id, d.styles || {});
        try { (ev.source || window).postMessage({ type: 'NEBULA_UPDATE_ACK', id: d.id, ok }, ev.origin || '*'); } catch(e){}
      }

      // INJECT CSS
      if(d.type === 'NEBULA_CSS_FILE') {
        const tagId = ZebKit.injectCss(d.content || '', d.fileId);
        try { (ev.source || window).postMessage({ type: 'NEBULA_CSS_ACK', fileId: d.fileId, tagId }, ev.origin || '*'); } catch(e){}
      }

    } catch(err) {
      console.warn('ZebKit message handler error', err);
    }
  }, false);

  // Opcional: expose quick console helpers quando devtools aberto
  if (typeof window !== 'undefined') {
    window.__ZebKitQuick = {
      scan() { return ZebKit.getButtons(); },
      groups() { return ZebKit.groupByClass(ZebKit.getButtons()); }
    };
  }

})();
</script>
<!-- End ZebKit -->