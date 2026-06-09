import { Nav } from "./nav";
import { Hero } from "./hero";
import { ProblemSplit } from "./problem-split";
import { FeatureBento } from "./feature-bento";
import { Compatibility } from "./compatibility";
import { Teams } from "./teams";
import { Footer } from "./footer";

/**
 * Landing page composition. Sections are appended here as they are built.
 * The `landing dark` wrapper forces dark mode for this page only and scopes
 * the landing CSS variables — it intentionally bypasses the OS-preference
 * script in the (public) layout, which /s/[slug] still uses.
 */
export function LandingPage() {
  return (
    <div className="landing dark min-h-screen bg-[var(--landing-bg)] text-white antialiased">
      <Nav />
      <main>
        <Hero />
        <ProblemSplit />
        <FeatureBento />
        <Compatibility />
        <Teams />
      </main>
      <Footer />
    </div>
  );
}
