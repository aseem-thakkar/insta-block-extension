// content.js
(function () {
  const HIDE_CLASS = '__ig_ext_hidden__';

  // Inject a stylesheet rule instead of relying on inline styles.
  // React can (and does) overwrite element.style.display on its own
  // re-renders, silently undoing a plain inline-style hide. A CSS
  // rule with !important beats React's non-important inline style
  // every time, so content stays hidden even after React re-renders
  // or recycles the DOM node (common with virtualized/scrolled lists).
  const styleTag = document.createElement('style');
  styleTag.textContent = `.${HIDE_CLASS} { display: none !important; }`;
  (document.head || document.documentElement).appendChild(styleTag);

  const IS_INSTAGRAM = location.hostname.includes('instagram.com');
  const IS_YOUTUBE = location.hostname.includes('youtube.com');

  const hide = (element) => {
    if (element && !element.classList.contains(HIDE_CLASS)) {
      console.log('Hiding element:', element);
      element.classList.add(HIDE_CLASS);
    }
  };

  const hiddenArticles = new Set();
  const clickBlockedElements = new WeakSet();

  // Swallow the click before Instagram's own handlers (play/pause,
  // mute toggle, "view profile", etc.) get a chance to react to it.
  // The mute/unmute button lives inside the same video wrapper we're
  // blocking clicks on. Detect it via its role="button" ancestor
  // containing the "Audio is muted"/"Audio is unmuted" SVG, so we
  // can let that one click through instead of swallowing it too.
  const isMuteButton = (target) => {
    const btn = target.closest && target.closest('[role="button"]');
    if (!btn) return false;
    const svg = btn.querySelector('svg[aria-label]');
    if (!svg) return false;
    const label = (svg.getAttribute('aria-label') || '').toLowerCase();
    return label.includes('audio');
  };

  const blockClick = (event) => {
    if (isMuteButton(event.target)) {
      return; // let mute/unmute clicks through normally
    }
    event.stopImmediatePropagation();
    event.stopPropagation();
    event.preventDefault();
  };

  // Distinguish a tap (finger barely moves - this is what toggles
  // play/pause) from a scroll/drag gesture (finger moves past a
  // small threshold). We must NOT call preventDefault() on
  // touchstart/touchmove, since that's what tells the browser to
  // cancel its native scroll gesture entirely. Instead we only
  // decide whether to block on touchend, once we know if it was a
  // tap or a scroll, and only preventDefault in the tap case.
  const TAP_MOVE_THRESHOLD = 10; // px
  const touchState = new WeakMap();

  const onTouchStart = (event) => {
    if (isMuteButton(event.target)) return;
    const t = event.touches[0];
    touchState.set(event.currentTarget, { x: t.clientX, y: t.clientY, moved: false });
    // Deliberately no preventDefault here - lets native scroll begin.
  };

  const onTouchMove = (event) => {
    const state = touchState.get(event.currentTarget);
    if (!state) return;
    const t = event.touches[0];
    if (Math.abs(t.clientX - state.x) > TAP_MOVE_THRESHOLD ||
        Math.abs(t.clientY - state.y) > TAP_MOVE_THRESHOLD) {
      state.moved = true;
    }
    // No preventDefault here either - scrolling stays uninterrupted.
  };

  const onTouchEnd = (event) => {
    if (isMuteButton(event.target)) return;
    const state = touchState.get(event.currentTarget);
    touchState.delete(event.currentTarget);
    if (state && !state.moved) {
      // This was a tap, not a scroll - block it so it can't
      // toggle play/pause (and suppress the synthesized click
      // that would otherwise follow).
      event.stopImmediatePropagation();
      event.stopPropagation();
      event.preventDefault();
    }
  };

  // "click" (and mouse events, for trackpad/mouse users) get the
  // simple blanket block since those don't drive scrolling. Touch
  // gets the tap-vs-scroll-aware handlers instead, so scrolling
  // through a full-screen video still works.
  const CLICK_LIKE_EVENTS = ['click', 'mousedown', 'mouseup'];

  const disableVideoClicks = (element) => {
    if (!element || clickBlockedElements.has(element)) return;
    CLICK_LIKE_EVENTS.forEach(evt => {
      element.addEventListener(evt, blockClick, { capture: true, passive: false });
    });
    element.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
    element.addEventListener('touchmove', onTouchMove, { capture: true, passive: true });
    element.addEventListener('touchend', onTouchEnd, { capture: true, passive: false });
    clickBlockedElements.add(element);
  };

  // Hide the "Reels" nav item. The wrapping span/classes are
  // auto-generated and change between loads, so anchor on the
  // stable href instead.
  const hideReelsLink = () => {
    document.querySelectorAll('a[href="/reels/"]').forEach(anchor => {
      const wrapper = anchor.closest('span') || anchor;
      hide(wrapper);
    });
  };

  // Hide the "Create" (New post) nav item. Its href is just "#" so
  // that's too generic to target; anchor on the SVG's aria-label
  // instead, which stays stable across Instagram's class churn.
  const hideCreateLink = () => {
    document.querySelectorAll('svg[aria-label="New post"]').forEach(svg => {
      const anchor = svg.closest('a');
      const wrapper = anchor ? (anchor.closest('span') || anchor) : svg;
      hide(wrapper);
    });
  };

  // Hide the "Search" nav item, same approach as Reels/Create.
  const hideSearchLink = () => {
    document.querySelectorAll('a[href="/explore/"]').forEach(anchor => {
      const wrapper = anchor.closest('span') || anchor;
      hide(wrapper);
    });
  };

  // Hide sponsored posts. Instagram marks these with a small "Ad"
  // (or "Sponsored") badge next to the username — find that badge,
  // then hide the whole enclosing <article> so the entire post goes.
  const hideAds = () => {
    document.querySelectorAll('article').forEach(article => {
      if (hiddenArticles.has(article)) return;

      const candidates = article.querySelectorAll('span');
      for (const span of candidates) {
        const text = span.textContent.trim();
        if (text === 'Ad' || text === 'Sponsored') {
          console.log('Found sponsored article:', article);
          hide(article);
          hiddenArticles.add(article);
          break;
        }
      }
    });
  };

  // Hide the "Suggested for you" people-you-may-know widget (profile
  // suggestions + Follow buttons). Distinct from the per-post
  // "Suggested for you" case below, since this widget isn't wrapped
  // in an <article>. Anchor on the "See all" link's stable href,
  // then hide its parent's parent, which is the row containing both
  // the heading and the suggestions list beneath it.
  const hideSuggestedForYouWidget = () => {
    document.querySelectorAll('a[href="/explore/people/"]').forEach(seeAllLink => {
      const headerRow = seeAllLink.closest('div');
      const widget = (headerRow && headerRow.parentElement) || headerRow;
      if (widget) {
        console.log('Found "Suggested for you" widget:', widget);
        hide(widget);
      }
    });
  };

  const processVideoClickBlocking = () => {
    // Actual <video> elements
    document.querySelectorAll('video').forEach(disableVideoClicks);

    // The wrapper div Instagram/Facebook uses around the player
    // (mute button, scrubber, etc. all live inside this container)
    document.querySelectorAll('div[aria-label="Video player"][role="group"]')
      .forEach(disableVideoClicks);
  };

  // Hide everything that comes after `marker` in the DOM, regardless
  // of what tag it's wrapped in. Walks up the ancestor chain and
  // hides every following sibling at each level, since Instagram's
  // "suggested posts" grid below the heading isn't reliably built
  // from <article> tags the way the main feed is.
  const hideEverythingAfter = (marker, maxLevels = 10) => {
    let current = marker;
    for (let level = 0; level < maxLevels && current && current.parentElement; level++) {
      let sibling = current.nextElementSibling;
      while (sibling) {
        hide(sibling);
        sibling = sibling.nextElementSibling;
      }
      current = current.parentElement;
      if (current === document.body) break;
    }
  };

  // --- YouTube: hide the end-of-video "up next" suggestion wall ---
  // Covers both the fullscreen grid of stills and the normal
  // in-player endscreen overlay. These are stable YouTube player
  // classes, not auto-generated, so a direct class match is safe
  // here (unlike Instagram's obfuscated classes elsewhere in this file).
  const hideYouTubeEndScreenSuggestions = () => {
    const selectors = [
      '.ytp-fullscreen-grid-stills-container', // fullscreen "video wall"
      '.html5-endscreen',                      // in-player endscreen overlay
      '.ytp-endscreen-content'                 // inner content of the above
    ];
    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(hide);
    });
  };

  const processPage = () => {
    console.log('Running processPage...');

    if (IS_INSTAGRAM) {
      const body = document.body;
      let caughtUpSection = null;
      let suggestedPostsSection = null;

      const textNodes = body.querySelectorAll('span, h1, h2, h3, h4');
      textNodes.forEach(node => {
        if (node.textContent.includes("re all caught up")) {
          console.log('Found "You\'re all caught up" section:', node);
          caughtUpSection = node.closest('div');
        }
        if (node.textContent.includes("Suggested Posts")) {
          console.log('Found "Suggested Posts" section:', node);
          suggestedPostsSection = node.closest('div');
        }
      });

      const targetSection = caughtUpSection || suggestedPostsSection;

      if (targetSection) {
        hideEverythingAfter(targetSection);
      }

      // Hide articles containing "Suggested for you"
      const articles = document.querySelectorAll('article');
      articles.forEach(article => {
        const spans = article.querySelectorAll('span');
        spans.forEach(span => {
          if (span.textContent.includes("Suggested for you")) {
            console.log('Found "Suggested for you" article:', article);
            hide(article);
          }
        });
      });

      processVideoClickBlocking();
      hideReelsLink();
      hideCreateLink();
      hideSearchLink();
      hideAds();
      hideSuggestedForYouWidget();
    }

    if (IS_YOUTUBE) {
      hideYouTubeEndScreenSuggestions();
    }
  };

  const mutationObserver = new MutationObserver((mutationsList) => {
    for (const mutation of mutationsList) {
      if (mutation.addedNodes.length > 0 || mutation.type === 'attributes') {
        processPage();
        break;
      }
    }
  });

  mutationObserver.observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['style', 'class']
  });

  processPage();
})();
