import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav */}
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/documents" className="text-base font-semibold text-gray-900">
            PricingCalc
          </Link>

          <nav className="flex items-center gap-4 text-sm">
            <NavLink
              to="/documents"
              className={({ isActive }) =>
                isActive ? "font-medium text-blue-600" : "text-gray-600 hover:text-gray-900"
              }
            >
              Documents
            </NavLink>
            <NavLink
              to="/reports"
              className={({ isActive }) =>
                isActive ? "font-medium text-blue-600" : "text-gray-600 hover:text-gray-900"
              }
            >
              Reports
            </NavLink>
            <span className="text-gray-300">|</span>
            <span className="text-gray-500 hidden sm:inline">{user?.userId.slice(0, 8)}</span>
            <button
              onClick={handleLogout}
              className="text-gray-600 hover:text-red-600"
            >
              Sign out
            </button>
          </nav>
        </div>
      </header>

      {/* Page content */}
      <main className="mx-auto max-w-5xl px-4 py-6">
        {children}
      </main>
    </div>
  );
}
