export type BotProfile = {
  id: string;
  name: string;
  role: 'Student' | 'Mentor' | 'Alumni';
  color: string;
  responses: string[];
};

export const BOTS: BotProfile[] = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Tech Mentor Bot',
    role: 'Mentor',
    color: '#0d9488',
    responses: [
      "That's a great question! Have you tried looking at the React documentation?",
      "I recommend breaking that problem down into smaller, testable functions.",
      "Always remember to check your browser's console for any hidden errors!",
      "I've seen this issue before. It usually comes down to asynchronous state updates.",
      "Keep pushing! Coding is all about perseverance."
    ]
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    name: 'Alumni Network Bot',
    role: 'Alumni',
    color: '#ea580c',
    responses: [
      "Hey! Let me know if you need any resume reviews.",
      "The job market is tough right now, but your portfolio is looking solid.",
      "I used a similar tech stack in my first job after graduating!",
      "Are you planning on going to the tech meetup this weekend?",
      "Feel free to connect with me on LinkedIn."
    ]
  },
  {
    id: '00000000-0000-0000-0000-000000000003',
    name: 'Friendly Peer Bot',
    role: 'Student',
    color: '#2563eb',
    responses: [
      "Haha yeah, I totally agree! 😂",
      "Wait, how did you fix that bug? I've been stuck on it for hours.",
      "Are we supposed to submit the assignment by midnight tonight?",
      "I'm just taking a coffee break ☕️",
      "Let's form a study group for the final project!"
    ]
  }
];
