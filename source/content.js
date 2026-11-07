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


  if (IS_INSTAGRAM) {
    styleTag.textContent += `
      html, body {
        overflow-x: hidden !important;
        overflow-x: clip !important;
      }
      * {
        overscroll-behavior-x: none !important;
      }
      @media (max-width: 767px) {
        article video {
          width: 100% !important;
          max-width: none !important;
          object-fit: contain !important;
        }
      }
    `;
  }


  const hide = (element) => {
    if (element && !element.classList.contains(HIDE_CLASS)) {
      console.log('Hiding element:', element);
      element.classList.add(HIDE_CLASS);
    }
  };

  const hiddenArticles = new Set();
  const clickBlockedElements = new WeakSet();

  const isMuteButton = (target) => {
    const btn = target.closest && target.closest('[role="button"], button');
    if (!btn) return false;
    const ownLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
    if (ownLabel.includes('audio') || ownLabel.includes('mute')) return true;
    const svg = btn.querySelector('svg[aria-label]');
    if (svg) {
      const svgLabel = (svg.getAttribute('aria-label') || '').toLowerCase();
      if (svgLabel.includes('audio') || svgLabel.includes('mute')) return true;
    }
    return false;
  };

  // Let controls inside the video-player wrapper handle their own
  // clicks and taps; only intercept gestures on the player itself.
  const isInteractiveControl = (target) => {
    const control = target.closest &&
      target.closest('button, a[href], input, textarea, select, label, summary, ' +
        '[role="button"], [role="link"], [role="menuitem"], [contenteditable="true"]');
    if (control) return true;

    // Some Instagram controls are custom elements without a button role.
    return isMuteButton(target);
  };

  // Instagram's own click handler on the video does two things at
  // once: toggles play/pause AND pulls the video into an immersive
  // "focus" view with infinite scroll. We only want the former. So
  // instead of letting the click through (which does both) or fully
  // blocking it (which does neither), we intercept it and drive
  // play/pause ourselves via the video API, then stop the event so
  // Instagram's handler never runs and never triggers focus mode.
  const findAssociatedVideo = (currentTarget) => {
    if (!currentTarget) return null;
    if (currentTarget.tagName === 'VIDEO') return currentTarget;
    // currentTarget is the div[aria-label="Video player"] wrapper.
    // The <video> isn't a simple sibling - it's nested in a separate
    // branch a couple of levels up, so climb until we find an
    // ancestor whose subtree actually contains a <video>.
    let node = currentTarget;
    for (let i = 0; i < 6 && node; i++) {
      node = node.parentElement;
      if (!node) break;
      const video = node.querySelector('video');
      if (video) return video;
    }
    return null;
  };

  const togglePlayPause = (currentTarget) => {
    const video = findAssociatedVideo(currentTarget);
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  const blockClick = (event) => {
    if (isInteractiveControl(event.target)) return;
    event.stopImmediatePropagation();
    event.stopPropagation();
    event.preventDefault();
    // mousedown/mouseup/click all fire for one physical click; only
    // toggle once, on 'click', to avoid toggling three times over.
    if (event.type === 'click') {
      togglePlayPause(event.currentTarget);
    }
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
    if (isInteractiveControl(event.target)) return;
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
    if (isInteractiveControl(event.target)) return;
    const state = touchState.get(event.currentTarget);
    touchState.delete(event.currentTarget);
    if (state && !state.moved) {
      // This was a tap, not a scroll - intercept it (so Instagram's
      // own handler and its focus-mode side effect never fire) and
      // drive play/pause ourselves instead.
      event.stopImmediatePropagation();
      event.stopPropagation();
      event.preventDefault();
      togglePlayPause(event.currentTarget);
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

  // Hide Instagram's mobile-web "Use the app" prompt without hiding
  // the bottom navigation beneath it.
  const hideUseAppBanner = () => {
    const { height, width } = viewportSize();
    if (!height || !width) return;

    document.querySelectorAll('a, button, span, div').forEach(label => {
      if (label.textContent.trim().toLowerCase() !== 'use the app') return;

      let candidate = label;
      for (let i = 0; i < 8 && candidate; i++, candidate = candidate.parentElement) {
        const rect = candidate.getBoundingClientRect();
        if (rect.width >= width * 0.8 && rect.height >= 35 && rect.height <= 160 &&
            rect.top >= height * 0.65 && rect.bottom <= height + 10) {
          hide(candidate);
          break;
        }
      }
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

  // Hide the "More posts from [user]" widget at the bottom of individual post pages.
  // We locate the heading text, then climb up two levels to hide the container
  // that holds both the heading and the grid of posts.
  const hideMorePostsFrom = () => {
    document.querySelectorAll('div[dir="auto"]').forEach(div => {
      if (div.textContent.includes("More posts from")) {
        const headerRow = div.parentElement;
        const widget = headerRow && headerRow.parentElement;
        if (widget) {
          console.log('Found "More posts from" widget:', widget);
          hide(widget);
        }
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

  // --- YouTube: hide only the suggested-video thumbnails in the
  // end-of-video overlay, not the endscreen container itself (which
  // YouTube reuses for other chrome like Subscribe/Replay buttons,
  // and which sits over the click-to-pause hit area).
  const hideYouTubeEndScreenSuggestions = () => {
    const selectors = [
      '.ytp-fullscreen-grid-stills-container', // fullscreen "video wall" grid
      'a.ytp-modern-videowall-still',          // individual suggestion card (current UI)
      'a.ytp-videowall-still'                  // individual suggestion card (older UI)
    ];
    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(hide);
    });
  };

  // ------------------------------------------------------------------
  // Mobile Reels: disable swipe-up / swipe-down paging
  //
  // On mobile Instagram the immersive Reels view is a full-screen,
  // vertically snapping track: one swipe = next reel, forever. The
  // desktop trick above (swallowing the click that opens focus mode)
  // doesn't help once the viewer is already open, so the swipe itself
  // has to be intercepted.
  //
  // Two separate things advance to the next reel, and both are stopped:
  //   1. the browser's native scroll/snap, cancelled with
  //      preventDefault() on a non-passive touchmove listener;
  //   2. Instagram's own JS gesture handler, which sits deeper in the
  //      tree and never receives the event because a capture-phase
  //      listener on window stops propagation first.
  //
  // Taps (play/pause), horizontal drags (seeking), and scrolling inside
  // overlays such as the comments sheet are intentionally left alone.
  // ------------------------------------------------------------------
  // Stories are the one view we leave alone: their only vertical gesture
  // is swipe-down-to-dismiss and they advance horizontally on tap. Reels
  // opened from a DM are NOT excluded - that overlay keeps the
  // /direct/t/... URL instead of navigating to /reels/, so the route is
  // handled in isInReelViewer() below.
  const REELS_EXCLUDED_ROUTE = /^\/stories(\/|$)/;

  const viewportSize = () => ({
    width: window.innerWidth || document.documentElement.clientWidth || 0,
    height: window.innerHeight || document.documentElement.clientHeight || 0
  });

  // Instagram's reel track is the element that carries the vertical
  // scroll-snap. It's usually an inline style (and a computed style).
  const isVerticalSnapTrack = (element) => {
    const computed = getComputedStyle(element).scrollSnapType;
    if (computed && /(^|\s)y(\s|$)/.test(computed)) return true;
    const inline = element.getAttribute('style') || '';
    return /scroll-snap-type\s*:\s*y\b/.test(inline);
  };

  const REEL_ROUTE = /^\/reels?(\/|$)/;
  const DIRECT_ROUTE = /^\/direct(\/|$)/;

  // A full-screen video alone isn't proof we're in the Reels viewer: a
  // tall 9:16 video in the feed can look like one. Require the reel
  // route, the viewer's modal wrapper, or the vertical snap track.
  const isInReelViewer = (video) => {
    if (REEL_ROUTE.test(location.pathname)) return true;
    if (video.closest('[role="dialog"]')) return true;
    // A reel shared in a DM opens the full-screen viewer as an overlay
    // and the URL stays on /direct/t/.../ . Nothing else in a DM thread
    // is a full-screen video, so the route plus the size check is enough.
    if (DIRECT_ROUTE.test(location.pathname)) return true;
    let node = video;
    for (let i = 0; node && i < 15; i++, node = node.parentElement) {
      if (isVerticalSnapTrack(node)) return true;
    }
    return false;
  };

  // The immersive player is a <video> that covers (almost) the whole
  // viewport. Feed videos, grid previews and Story thumbnails are far
  // smaller, so this is a reliable "we are inside the immersive viewer"
  // signal that doesn't depend on Instagram's obfuscated class names.
  const findImmersiveReelVideo = () => {
    if (REELS_EXCLUDED_ROUTE.test(location.pathname)) return null;
    const { width, height } = viewportSize();
    if (!width || !height) return null;

    const onScreen = (rect) => rect.bottom > 0 && rect.top < height;

    for (const video of document.querySelectorAll('video')) {
      const rect = video.getBoundingClientRect();
      // Skip preloaded neighbours that sit just off-screen in the track.
      if (!onScreen(rect)) continue;
      if (rect.width >= width * 0.85 && rect.height >= height * 0.7 &&
          isInReelViewer(video)) {
        return video;
      }
    }

    // Fallback for letterboxed reels: the video itself may be shorter
    // than the viewport, but it still lives inside the full-screen
    // vertical snap track that does the paging.
    for (const track of document.querySelectorAll('[style*="scroll-snap-type"]')) {
      const rect = track.getBoundingClientRect();
      if (!onScreen(rect) || rect.width < width * 0.8 || rect.height < height * 0.8) continue;
      if (!isVerticalSnapTrack(track)) continue;
      for (const video of track.querySelectorAll('video')) {
        if (onScreen(video.getBoundingClientRect())) return video;
      }
    }

    // Reels can also be photo carousels. On a reel URL the full-screen
    // vertical snap track alone is enough evidence that the viewer is
    // open, so lock the track itself.
    if (REEL_ROUTE.test(location.pathname)) {
      for (const track of document.querySelectorAll('[style*="scroll-snap-type"]')) {
        const rect = track.getBoundingClientRect();
        if (!onScreen(rect) || rect.width < width * 0.8 || rect.height < height * 0.8) continue;
        if (isVerticalSnapTrack(track)) return track;
      }
    }

    return null;
  };

  // Comments, the caption and other sheets are scrollable overlays that
  // sit on top of the reel. A swipe starting inside one of those is a
  // normal scroll and must keep working; a swipe starting on the reel
  // itself is the one we want to kill.
  const swipeStartsInScrollableOverlay = (target, reelRoot) => {
    if (!(target instanceof Element)) return false;
    for (let node = target;
         node && node !== document.body && node !== document.documentElement;
         node = node.parentElement) {
      if (node === reelRoot || node.contains(reelRoot)) return false;
      const style = getComputedStyle(node);
      if (style.overflowY !== 'auto' && style.overflowY !== 'scroll' && style.overflowY !== 'overlay') continue;
      if (node.scrollHeight - node.clientHeight > 16) return true;
    }
    return false;
  };

  const SWIPE_MOVE_SLOP = 8; // px of movement before a touch counts as a drag

  const swipeGuard = {
    armed: false,
    blocked: false,
    startX: 0,
    startY: 0,
    suppressClickUntil: 0
  };

  const armSwipeGuard = (target, x, y) => {
    swipeGuard.armed = false;
    swipeGuard.blocked = false;
    const reelVideo = findImmersiveReelVideo();
    if (!reelVideo) return;
    if (swipeStartsInScrollableOverlay(target, reelVideo)) return;
    swipeGuard.armed = true;
    swipeGuard.startX = x;
    swipeGuard.startY = y;
  };

  const swipeShouldBeBlocked = (x, y) => {
    if (!swipeGuard.armed) return false;
    if (swipeGuard.blocked) return true;
    const dx = Math.abs(x - swipeGuard.startX);
    const dy = Math.abs(y - swipeGuard.startY);
    if (dx < SWIPE_MOVE_SLOP && dy < SWIPE_MOVE_SLOP) return false;
    // Horizontal drags are seek gestures / carousels - let them be.
    if (dx >= dy) {
      swipeGuard.armed = false;
      return false;
    }
    swipeGuard.blocked = true;
    return true;
  };

  const blockSwipeEvent = (event) => {
    swipeGuard.suppressClickUntil = performance.now() + 400;
    if (event.cancelable) event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
  };

  const onSwipeTouchStart = (event) => {
    if (event.touches.length !== 1) {
      swipeGuard.armed = false;
      swipeGuard.blocked = false;
      return;
    }
    const touch = event.touches[0];
    armSwipeGuard(event.target, touch.clientX, touch.clientY);
  };

  const onSwipeTouchMove = (event) => {
    if (!swipeGuard.armed || event.touches.length !== 1) return;
    const touch = event.touches[0];
    if (swipeShouldBeBlocked(touch.clientX, touch.clientY)) {
      blockSwipeEvent(event);
    }
  };

  // The touchend has to be swallowed too, otherwise Instagram can
  // compare its recorded touchstart position with the touchend
  // position and advance anyway. preventDefault() on touchend also
  // suppresses the synthetic click a swipe leaves behind (which would
  // otherwise pause the video through the handlers above).
  const onSwipeTouchEnd = (event) => {
    const blocked = swipeGuard.blocked;
    swipeGuard.armed = false;
    if (!blocked) return;
    blockSwipeEvent(event);
  };

  // WebKit also emits pointer events for touch. Blocking both streams
  // keeps Instagram from working around the cancelled touch events.
  const isTouchPointer = (event) => event.pointerType === 'touch';

  const onSwipePointerDown = (event) => {
    if (!isTouchPointer(event)) return;
    armSwipeGuard(event.target, event.clientX, event.clientY);
  };

  const onSwipePointerMove = (event) => {
    if (!isTouchPointer(event) || !swipeGuard.armed) return;
    if (swipeShouldBeBlocked(event.clientX, event.clientY)) {
      blockSwipeEvent(event);
    }
  };

  const onSwipePointerEnd = (event) => {
    if (!isTouchPointer(event)) return;
    const blocked = swipeGuard.blocked;
    swipeGuard.armed = false;
    if (!blocked) return;
    blockSwipeEvent(event);
  };

  // Safety net: if a browser still synthesises a click after a blocked
  // swipe, swallow it so it can't toggle play/pause.
  const onSwipeClick = (event) => {
    if (performance.now() > swipeGuard.suppressClickUntil) return;
    if (event.cancelable) event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
  };

  const installMobileReelSwipeLock = () => {
    if (window.__igReelSwipeLockInstalled) return;
    window.__igReelSwipeLockInstalled = true;

    // Capture phase on window so these run before React's root
    // listeners (and before the per-video handlers above).
    window.addEventListener('touchstart', onSwipeTouchStart, { capture: true, passive: true });
    window.addEventListener('touchmove', onSwipeTouchMove, { capture: true, passive: false });
    window.addEventListener('touchend', onSwipeTouchEnd, { capture: true, passive: false });
    window.addEventListener('touchcancel', onSwipeTouchEnd, { capture: true, passive: true });

    window.addEventListener('pointerdown', onSwipePointerDown, { capture: true, passive: true });
    window.addEventListener('pointermove', onSwipePointerMove, { capture: true, passive: false });
    window.addEventListener('pointerup', onSwipePointerEnd, { capture: true, passive: false });
    window.addEventListener('pointercancel', onSwipePointerEnd, { capture: true, passive: false });

    window.addEventListener('click', onSwipeClick, { capture: true, passive: false });
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
      hideUseAppBanner();
      hideAds();
      hideSuggestedForYouWidget();
      hideMorePostsFrom(); // Added call to new block function here
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

  if (IS_INSTAGRAM) {
    installMobileReelSwipeLock();
  }

  processPage();
})();