/**
 * Navigation component
 */
import { Link, useLocation } from 'react-router-dom';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { toggleSidebar } from '@/store/slices/uiSlice';
import { MenuIcon, DashboardIcon, DatasetsIcon, QueriesIcon, SchemaIcon } from '@/components/Icons/Icons';
import './Navigation.css';

const Navigation = () => {
  const location = useLocation();
  const dispatch = useAppDispatch();
  const sidebarOpen = useAppSelector((state) => state.ui.sidebarOpen);

  const navItems = [
    { path: '/', label: 'Dashboard', icon: DashboardIcon },
    { path: '/datasets', label: 'Datasets', icon: DatasetsIcon },
    { path: '/queries', label: 'Queries', icon: QueriesIcon },
    { path: '/schema', label: 'Schema', icon: SchemaIcon },
  ];

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <nav className="navigation">
      <div className="navigation-container">
        <div className="navigation-brand">
          <button
            className="navigation-toggle"
            onClick={() => dispatch(toggleSidebar())}
            aria-label="Toggle sidebar"
          >
            <MenuIcon />
          </button>
          <Link to="/" className="navigation-logo">
            <span className="navigation-logo-text">Graph Query Platform</span>
          </Link>
        </div>

        <div className={`navigation-menu ${sidebarOpen ? 'open' : ''}`}>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`navigation-item ${isActive(item.path) ? 'active' : ''}`}
              >
                <Icon />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>

      </div>
    </nav>
  );
};

export default Navigation;

