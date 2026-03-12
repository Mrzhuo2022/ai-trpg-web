/**
 * Smooth streaming text display with typewriter effect
 */

let displayQueue: Array<{ text: string; appendTo: (char: string) => void }> = [];
let isDisplaying = false;
let rafId: number | null = null;

/**
 * Add text to the display queue
 */
export function streamDisplay(
  text: string,
  appendTo: (char: string) => void,
  options?: {
    speed?: number; // chars per frame (default: 2)
    immediate?: boolean; // show immediately without animation (default: false)
  }
) {
  if (options?.immediate) {
    appendTo(text);
    return;
  }

  displayQueue.push({ text, appendTo });
  
  if (!isDisplaying) {
    isDisplaying = true;
    processQueue();
  }
}

/**
 * Process the display queue with smooth animation
 */
function processQueue() {
  if (displayQueue.length === 0) {
    isDisplaying = false;
    return;
  }

  const current = displayQueue[0];
  if (!current) {
    displayQueue.shift();
    rafId = requestAnimationFrame(processQueue);
    return;
  }

  const { text, appendTo } = current;
  const speed = 2; // chars per frame
  
  if (text.length > 0) {
    const chunk = text.slice(0, speed);
    appendTo(chunk);
    current.text = text.slice(speed);
    rafId = requestAnimationFrame(processQueue);
  } else {
    displayQueue.shift();
    rafId = requestAnimationFrame(processQueue);
  }
}

/**
 * Cancel any ongoing display animation
 */
export function cancelDisplayAnimation() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  displayQueue = [];
  isDisplaying = false;
}

/**
 * Immediate display all queued text (emergency flush)
 */
export function flushDisplayQueue() {
  cancelDisplayAnimation();
  // Any remaining queued text will be handled immediately by next streamDisplay call with immediate: true
}
