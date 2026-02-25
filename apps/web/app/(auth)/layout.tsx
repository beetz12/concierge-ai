/**
 * Auth layout - minimal layout for login/register pages
 * No sidebar, just centered content
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-abyss">
      {children}
    </div>
  );
}
