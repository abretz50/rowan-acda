// Optional: call makeLoopingGallery('#my-loop-gallery') after DOM ready
export function makeLoopingGallery(selector){
  const el = document.querySelector(selector);
  if (!el) return;
  const items = [...el.children];
  // duplicate sequence once for seamless scroll
  items.forEach(node => el.appendChild(node.cloneNode(true)));
}