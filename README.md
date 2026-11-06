# insta-block-suggested


Chrome extension to block 'suggested posts' on Instagram
and
block suggested videos at the end of videos on youtube too


Instagram page-level horizontal overflow and overscroll are disabled.
Vertical scrolling and horizontal post carousel gestures are left alone.


On mobile (e.g. Orion on iOS) the immersive Reels viewer is also locked:
vertical swipes no longer page to the next/previous reel, so the
infinite doom-scroll loop is broken. Taps, horizontal seeking and
scrolling inside the comments sheet still work, and Like, Comment and
other overlay controls remain clickable. Reels opened from a direct
message are covered too, even though the URL stays on /direct/t/.../
while the viewer is open.

On phone-sized screens, feed videos expand to the post's available width
without overriding Instagram's media-frame height or stretching the video.