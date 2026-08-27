export function FeatureCards() {
  return (
    <>
      <div className="section-label" id="features">
        Feature Surfaces
      </div>
      <div className="cards-grid">
        <div className="sticky-card card-mint">
          <div>
            <div className="card-tag">// 01 ISOLATION</div>
            <div className="card-heading">Per-User Isolation</div>
          </div>
          <div className="card-body">
            Your commits run with your own encrypted token against your own
            repo. No shared identity, no cross-user access — ever.
          </div>
        </div>
        <div className="sticky-card card-teal">
          <div>
            <div className="card-tag">// 02 INFRASTRUCTURE</div>
            <div className="card-heading">Serverless Engine</div>
          </div>
          <div className="card-body">
            Zero server maintenance. Next.js route handlers + Netlify scheduled
            heartbeat + GitHub API + Netlify Blobs store, all open source.
          </div>
        </div>
        <div className="sticky-card card-blush">
          <div>
            <div className="card-tag">// 03 ON-DEMAND</div>
            <div className="card-heading">Instant Dispatch</div>
          </div>
          <div className="card-body">
            Manual triggers execute instantly from your dashboard whenever you
            need an extra commit.
          </div>
        </div>
      </div>
    </>
  );
}
