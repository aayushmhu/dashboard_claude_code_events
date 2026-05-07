import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
      <p className="text-4xl font-bold text-foreground">404</p>
      <p className="text-sm">Page not found</p>
      <Link href="/" className="text-sm text-primary hover:underline">Go to dashboard</Link>
    </div>
  );
}
