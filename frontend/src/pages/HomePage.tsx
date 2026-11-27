import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Plus } from 'lucide-react';
import { useAuth } from '@/api/AuthContext';
import { useOrg } from '@/api/OrgContext';
import './HomePage.css';

const chapters = [
  {
    id: 'events', label: 'Events', heading: 'From sign-up to submission.',
    description: 'Open registration, bring teams together and give judges a clear place to review their work.',
    link: 'Explore events & hackathons',
  },
  {
    id: 'meetings', label: 'Meetings', heading: 'Make the meeting count.',
    description: 'Share an agenda, record the decisions and give each follow-up a person and a due date.',
    link: 'Explore meetings',
  },
  {
    id: 'projects', label: 'Projects', heading: 'See the work through.',
    description: 'Give every task an owner. Follow deadlines in a list or move between stages on your project board.',
    link: 'Explore projects & tasks',
  },
] as const;

const questions = [
  ['Can we start with just one tool?', 'Yes. Your organisation can use events, meetings or projects on their own. An administrator can enable the other tools when your team needs them.'],
  ['How do I join a public event?', 'Browse events, open the event you want and check its registration dates. Sign in with your verified account to register while places are available.'],
  ['How are hackathon entries judged?', 'Organisers assign judges to review submissions. Judges score the work against the event criteria, and organisers decide when to publish results.'],
  ['Does joining an event give me access to the organiser’s workspace?', 'Your registration gives you access to activities for that event. Joining the organiser’s workspace requires a separate membership.'],
  ['Who can see meeting minutes?', 'Meeting visibility and your access determine which records you can open. Organisers can restrict access to confidential minutes.'],
];

function ChapterNavigation() {
  const [current, setCurrent] = useState('events');

  useEffect(() => {
    if (!('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) setCurrent(entry.target.id);
      }
    }, { rootMargin: '-23% 0px -69% 0px' });
    for (const { id } of chapters) {
      const section = document.getElementById(id);
      if (section) observer.observe(section);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <nav className="tour-nav" aria-label="Explore ManageX">
      <div className="tour-nav-inner">
        {chapters.map(({ id, label }) => (
          <a key={id} href={`#${id}`} aria-current={current === id ? 'location' : undefined} onClick={() => setCurrent(id)}>{label}</a>
        ))}
      </div>
    </nav>
  );
}

export function HomePage() {
  const { isAuthenticated, user } = useAuth();
  const { organisations } = useOrg();
  const [openQuestion, setOpenQuestion] = useState<number | null>(null);
  const hasWorkspace = organisations.length > 0 || user?.isPlatformAdmin;
  const accountPath = isAuthenticated ? (hasWorkspace ? '/app' : '/events/dashboard') : '/auth/register';
  const accountLabel = isAuthenticated ? (hasWorkspace ? 'Open workspace' : 'My events') : 'Create account';

  return (
    <div className="mx-home">
      <section className="mx-hero" aria-labelledby="home-heading">
        <div className="hero-art" aria-hidden="true">
          <img src="/art/hero.webp" srcSet="/art/hero-small.webp 720w, /art/hero.webp 1440w" sizes="(max-width: 730px) 100vw, 70vw" width="1440" height="960" fetchPriority="high" alt="" />
        </div>
        <div className="hero-content">
          <h1 id="home-heading"><span>Bring people</span>{' '}<span>together. Move</span>{' '}<span>work <em>forward.</em></span></h1>
          <p>Run events, plan meetings and keep team projects on track in one workspace.</p>
          <div className="hero-actions">
            <Link className="home-primary" to={accountPath}>{accountLabel}</Link>
            <Link className="home-text-link" to="/events">Browse events <ArrowUpRight aria-hidden="true" /></Link>
          </div>
        </div>
      </section>

      <div className="product-tour">
        <ChapterNavigation />
        {chapters.map(({ id, heading, description, link }) => (
          <section key={id} id={id} className={`tour-chapter chapter-${id}`} aria-labelledby={`${id}-heading`}>
            <div className="chapter-art" aria-hidden="true">
              <img src={`/art/${id}.webp`} srcSet={`/art/${id}-small.webp 720w, /art/${id}.webp 1440w`} sizes="(max-width: 730px) 100vw, 57vw" width="1440" height="960" loading="lazy" decoding="async" alt="" />
            </div>
            <div className="chapter-content">
              <h2 id={`${id}-heading`}>{heading}</h2>
              <p>{description}</p>
              <Link className="home-text-link" to={`/modules#${id}`}>{link} <ArrowUpRight aria-hidden="true" /></Link>
            </div>
          </section>
        ))}
      </div>

      <section className="home-questions" aria-labelledby="faq-heading">
        <h2 id="faq-heading">Common questions</h2>
        <div className="question-list">
          {questions.map(([question, answer], index) => (
            <div key={question} className="home-question">
              <h3>
                <button type="button" onClick={() => setOpenQuestion(openQuestion === index ? null : index)}
                  aria-controls={`answer-${index}`} aria-expanded={openQuestion === index}>
                  {question}<Plus aria-hidden="true" />
                </button>
              </h3>
              <p id={`answer-${index}`} hidden={openQuestion !== index}>{answer}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
