import { Link, useLocation } from "wouter";

interface SidebarProps {
  collapsed: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ collapsed }) => {
  const [location] = useLocation();

  const isActive = (path: string) => {
    return location === path;
  };

  return (
    <div 
      className={`flex flex-col ${collapsed ? 'w-16' : 'w-64'} bg-white border-r border-gray-200 transition-all duration-300 ease-in-out`}
    >
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center">
          <svg 
            className="h-8 w-8 mr-2 text-primary" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
          >
            <path d="M2 2a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v20l-10-5-10 5V2z" />
          </svg>
          {!collapsed && (
            <h1 className="font-bold text-lg text-primary">MikroMonitor</h1>
          )}
        </div>
      </div>
      
      <div className="overflow-y-auto flex-grow">
        <nav className="mt-2 px-2">
          <div className="mb-4">
            <p className={`text-xs font-medium text-gray-500 uppercase tracking-wider px-3 py-2 ${collapsed ? 'text-center' : ''}`}>
              {collapsed ? "" : "Dashboard"}
            </p>
            <Link href="/">
              <a className={`flex items-center px-3 py-2 text-sm font-medium rounded-md ${isActive('/') ? 'bg-primary bg-opacity-10 text-primary border-l-4 border-primary' : 'text-neutral-dark hover:bg-gray-100'}`}>
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${isActive('/') ? 'text-primary' : 'text-gray-500'} ${collapsed ? 'mx-auto' : 'mr-3'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7"></rect>
                  <rect x="14" y="3" width="7" height="7"></rect>
                  <rect x="14" y="14" width="7" height="7"></rect>
                  <rect x="3" y="14" width="7" height="7"></rect>
                </svg>
                {!collapsed && "Overview"}
              </a>
            </Link>
          </div>
          
          <div className="mb-4">
            <p className={`text-xs font-medium text-gray-500 uppercase tracking-wider px-3 py-2 ${collapsed ? 'text-center' : ''}`}>
              {collapsed ? "" : "Monitoring"}
            </p>
            <a className={`flex items-center px-3 py-2 text-sm font-medium rounded-md text-neutral-dark hover:bg-gray-100`}>
              <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 text-gray-500 ${collapsed ? 'mx-auto' : 'mr-3'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 20V10" />
                <path d="M12 20V4" />
                <path d="M6 20v-6" />
              </svg>
              {!collapsed && "Performance"}
            </a>
            <a className={`flex items-center px-3 py-2 text-sm font-medium rounded-md text-neutral-dark hover:bg-gray-100`}>
              <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 text-gray-500 ${collapsed ? 'mx-auto' : 'mr-3'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12.55a11 11 0 0 1 14.08 0" />
                <path d="M1.42 9a16 16 0 0 1 21.16 0" />
                <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                <line x1="12" y1="20" x2="12" y2="20" />
              </svg>
              {!collapsed && "Network"}
            </a>
            <a className={`flex items-center px-3 py-2 text-sm font-medium rounded-md text-neutral-dark hover:bg-gray-100`}>
              <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 text-gray-500 ${collapsed ? 'mx-auto' : 'mr-3'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              {!collapsed && "Security"}
            </a>
          </div>
          
          <div className="mb-4">
            <p className={`text-xs font-medium text-gray-500 uppercase tracking-wider px-3 py-2 ${collapsed ? 'text-center' : ''}`}>
              {collapsed ? "" : "Management"}
            </p>
            <Link href="/devices">
              <a className={`flex items-center px-3 py-2 text-sm font-medium rounded-md ${isActive('/devices') ? 'bg-primary bg-opacity-10 text-primary border-l-4 border-primary' : 'text-neutral-dark hover:bg-gray-100'}`}>
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${isActive('/devices') ? 'text-primary' : 'text-gray-500'} ${collapsed ? 'mx-auto' : 'mr-3'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="6" width="20" height="12" rx="2" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                </svg>
                {!collapsed && "Devices"}
              </a>
            </Link>
            <Link href="/alerts">
              <a className={`flex items-center px-3 py-2 text-sm font-medium rounded-md ${isActive('/alerts') ? 'bg-primary bg-opacity-10 text-primary border-l-4 border-primary' : 'text-neutral-dark hover:bg-gray-100'}`}>
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${isActive('/alerts') ? 'text-primary' : 'text-gray-500'} ${collapsed ? 'mx-auto' : 'mr-3'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                {!collapsed && "Alerts"}
              </a>
            </Link>
            <a className={`flex items-center px-3 py-2 text-sm font-medium rounded-md text-neutral-dark hover:bg-gray-100`}>
              <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 text-gray-500 ${collapsed ? 'mx-auto' : 'mr-3'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              {!collapsed && "Settings"}
            </a>
          </div>
          
          <div className="mb-4">
            <p className={`text-xs font-medium text-gray-500 uppercase tracking-wider px-3 py-2 ${collapsed ? 'text-center' : ''}`}>
              {collapsed ? "" : "Reports"}
            </p>
            <a className={`flex items-center px-3 py-2 text-sm font-medium rounded-md text-neutral-dark hover:bg-gray-100`}>
              <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 text-gray-500 ${collapsed ? 'mx-auto' : 'mr-3'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              {!collapsed && "Performance Reports"}
            </a>
            <a className={`flex items-center px-3 py-2 text-sm font-medium rounded-md text-neutral-dark hover:bg-gray-100`}>
              <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 text-gray-500 ${collapsed ? 'mx-auto' : 'mr-3'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              {!collapsed && "Event History"}
            </a>
          </div>
        </nav>
      </div>
      
      <div className="border-t border-gray-200 p-4">
        <div className="flex items-center">
          <div className="h-8 w-8 rounded-full bg-primary text-white flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          {!collapsed && (
            <div className="ml-3">
              <p className="text-sm font-medium text-neutral-dark">Network Admin</p>
              <a href="#" className="text-xs text-gray-500 hover:text-primary">Logout</a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
