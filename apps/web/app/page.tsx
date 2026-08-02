import Link from "next/link";

export default function HomePage() {
  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>Base Template</h1>
      <p>Next.js + NestJS + Prisma monorepo.</p>
      <p>
        <Link href="/users">See the users example →</Link>
      </p>
    </main>
  );
}
