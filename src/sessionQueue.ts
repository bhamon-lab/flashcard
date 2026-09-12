export function shuffleCards<T>(cards: readonly T[], random: () => number = Math.random): T[] {
  const shuffled = [...cards];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

/** Inserts a card back into the queue without replacing the card currently shown. */
export function insertLaterInQueue<T>(queue: readonly T[], card: T, random: () => number = Math.random): T[] {
  if (!queue.length) return [card];

  // Position 0 stays visible. Every other position, including the end, is possible.
  const insertionIndex = 1 + Math.floor(random() * queue.length);
  const next = [...queue];
  next.splice(insertionIndex, 0, card);
  return next;
}
