/** A source citation attached to a generated answer */
export interface Citation {
  index: number;
  title: string;
  section: string;
  url: string;
  chunkId: string;
}

/** The final answer produced by the answer stage */
export interface Answer {
  question: string;
  text: string;
  citations: Citation[];
  /** True if relevant documentation was found */
  found: boolean;
  /** True if every citation was verified against retrieved content */
  grounded: boolean;
}
