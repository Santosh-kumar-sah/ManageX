import { Link } from 'react-router-dom';

const tools = [
  {
    id: 'events',
    name: 'Events & hackathons',
    summary: 'Give participants one place to register, find their team and submit their work.',
    features: [
      ['Registration', 'Share a public event page, set a registration window and keep track of available places.'],
      ['Teams and submissions', 'Let participants form a team and send their project links before the deadline.'],
      ['Judging', 'Assign judges, review their scores and publish the results when you’re ready.'],
    ],
  },
  {
    id: 'meetings',
    name: 'Meetings',
    summary: 'Let people know when to meet, what to prepare and who owns the next step.',
    features: [
      ['Invitations', 'Set the time, time zone and location. See who plans to attend.'],
      ['Agendas and minutes', 'Prepare discussion topics in advance and record decisions in the meeting minutes.'],
      ['Follow-up', 'Give each action item an owner and a due date so your team can follow up.'],
    ],
  },
  {
    id: 'projects',
    name: 'Projects & tasks',
    summary: 'See who’s working on what and which deadlines are coming up.',
    features: [
      ['Project teams', 'Bring the people doing the work into the same project.'],
      ['Boards and lists', 'Switch between the board and list to see tasks by stage or scan their details.'],
      ['Task details', 'Set priorities, assign tasks and keep comments with the work they belong to.'],
    ],
  },
];

export function ModulesPage() {
  return (
    <div className="mx-info-page">
      <header className="mx-product-intro">
        <div>
          <h1>Tools for your <em>team.</em></h1>
          <p className="mx-info-intro">Run events, meetings and projects in one workspace. Choose the tools your organisation needs.</p>
          <nav aria-label="Explore the product" className="mx-info-jump">
            {tools.map(tool => <Link key={tool.id} to={'#' + tool.id}>{tool.name}</Link>)}
          </nav>
        </div>
        <img className="mx-product-art" alt="" src="/art/projects-small.webp"
          srcSet="/art/projects-small.webp 720w, /art/projects.webp 1440w" sizes="(max-width: 700px) 90vw, 38vw" />
      </header>
      <div className="mx-info-sections">
        {tools.map(tool => (
          <section key={tool.id} id={tool.id} tabIndex={-1} aria-labelledby={tool.id + '-title'} className="mx-info-row">
            <div>
              <h2 id={tool.id + '-title'}>{tool.name}</h2>
              <p>{tool.summary}</p>
              {tool.id === 'events' && <Link to="/events" className="mx-info-link">Browse public events</Link>}
            </div>
            <dl>
              {tool.features.map(([title, detail]) => (
                <div key={title}>
                  <dt>{title}</dt>
                  <dd>{detail}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  );
}
