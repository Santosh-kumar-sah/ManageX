import { Link } from 'react-router-dom';

const questions = [
  {
    question: 'Who can see my workspace?',
    answer: 'Your organisation has its own workspace. A membership and a role determine which tools and records a person can open. If you belong to several organisations, switch workspaces to see each team’s work.',
  },
  {
    question: 'What can event participants see?',
    answer: 'A public event page shows the details the organiser shares. Registering gives you access to your own entry and the team activities available for that event. Organisation membership requires a separate invitation.',
  },
  {
    question: 'What does a judge invitation include?',
    answer: 'It gives the invited judge access to their assigned evaluations. Judges use the email address on the invitation to accept and review their assignments.',
  },
  {
    question: 'Who can read meeting minutes?',
    answer: 'Access depends on the meeting and the visibility chosen for its minutes. Organisers can restrict confidential minutes to authorised readers.',
  },
  {
    question: 'How do we keep track of changes?',
    answer: 'Administrators with access to the audit log can review recorded actions such as membership and permission changes.',
  },
];

export function SecurityPage() {
  return (
    <>
      <header className="mx-security-head">
        <div className="mx-info-page">
          <h1>Security <em>&amp; privacy.</em></h1>
          <p className="mx-info-intro">Understand what’s public, what stays in your workspace and how invitations give people access to the work they need.</p>
        </div>
      </header>
      <div className="mx-info-page mx-security-details">
        {questions.map(({ question, answer }) => (
          <section className="mx-info-row" key={question}>
            <h2>{question}</h2>
            <div><p>{answer}</p></div>
          </section>
        ))}
        <div className="mx-info-actions">
          <Link className="mx-info-cta" to="/auth/register">Create account</Link>
          <Link className="mx-info-link" to="/modules">Explore the product</Link>
        </div>
      </div>
    </>
  );
}
