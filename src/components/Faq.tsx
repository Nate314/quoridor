import { useState, useEffect } from 'react';

const FAQS: { question: string; answer: string }[] = [
  {
    question: 'How do I join a game?',
    answer: 'Enter your name and a Game ID. Anyone who enters the same Game ID joins the same game, up to four ' +
      'players. The game needs at least two players, and nobody can join after the first move.'
  },
  {
    question: 'How do I move?',
    answer: 'On your turn, with Move selected, click one of the highlighted squares. Move is selected at the ' +
      'start of every turn. You can move one square up, down, left or right, or jump straight over a pawn ' +
      'next to you if the square behind it is free.'
  },
  {
    question: 'How do I place a wall?',
    answer: 'On your turn, choose Horizontal Wall or Vertical Wall, then hover over the board to preview the wall ' +
      'and click to place it. A horizontal wall runs under the square you click and the one to its right. A ' +
      'vertical wall runs along the right of the square you click and the one below it. Placing a wall uses ' +
      'your turn.'
  },
  {
    question: 'Where can walls go?',
    answer: 'A wall cannot overlap or cross another wall, and it cannot completely cut any player off from their ' +
      'goal. Walls stay on the board for the rest of the game.'
  },
  {
    question: 'How many walls do I get?',
    answer: 'Ten each in a two-player game, five each with three or four players. The count is shown under ' +
      '"Walls left".'
  },
  {
    question: 'How do I win?',
    answer: 'Be the first to reach the side of the board opposite where you started. That side of the board frame ' +
      'is in your pawn\'s colour, and every player\'s goal is listed under "Goals".'
  },
  {
    question: 'What do Undo and Show Last Move do?',
    answer: 'Undo asks everyone to take back the last turn; it happens only if every player still in the game ' +
      'approves. Show Last Move highlights the previous move while you hover over it, or click it to keep ' +
      'the highlight on.'
  },
  {
    question: 'What happens if someone leaves?',
    answer: 'Their pawn and walls stay on the board and their turns are skipped.'
  }
];

export default function Faq() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="faq-button"
        onClick={() => setOpen(true)}
        aria-label="Frequently asked questions"
      >
        ?
      </button>
      {open && (
        <div className="faq-overlay" onClick={() => setOpen(false)}>
          <div className="faq-panel" role="dialog" aria-label="Frequently asked questions" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="faq-close" onClick={() => setOpen(false)} aria-label="Close">
              ×
            </button>
            <h2>FAQs</h2>
            {FAQS.map(({ question, answer }) => (
              <div key={question} className="faq-item">
                <h3>{question}</h3>
                <p>{answer}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
