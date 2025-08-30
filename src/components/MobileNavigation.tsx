import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useLocation } from 'react-router-dom';
import { Home, Target, Gamepad2, Gift, Trophy, ChevronUp, ChevronDown } from 'lucide-react';

const MobileNavigation: React.FC = () => {
  const location = useLocation();
  const [showTasksSubmenu, setShowTasksSubmenu] = useState(false);

  const isActive = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const toggleTasksSubmenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setShowTasksSubmenu(!showTasksSubmenu);
  };

  const navItems = [
    { path: '/dashboard', label: 'Home', icon: Home },
    { path: '/tasks', label: 'Tasks', icon: Target, hasSubmenu: true },
    { path: '/games', label: 'Games', icon: Gamepad2 },
    { path: '/rewards', label: 'Rewards', icon: Gift },
    { path: '/leaderboard', label: 'Leaderboard', icon: Trophy }
  ];

  const taskSubmenuItems = [
    { path: '/tasks', label: 'Social Tasks' },
    { path: '/special-tasks', label: 'Special Tasks' }
  ];

  return (
    <>
      {/* Main Navigation Bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-gray-900/95 backdrop-blur-md border-t border-white/10 shadow-lg">
        <div className="flex justify-around items-center h-16">
          {navItems.map((item) => (
            <div key={item.path} className="relative flex-1">
              {item.hasSubmenu ? (
                <button
                  onClick={toggleTasksSubmenu}
                  className={`w-full h-full flex flex-col items-center justify-center ${
                    isActive(item.path) || isActive('/special-tasks')
                      ? 'text-purple-400'
                      : 'text-gray-400 hover:text-gray-300'
                  }`}
                >
                  <item.icon className="h-6 w-6 mb-1" />
                  <span className="text-xs">{item.label}</span>
                  {showTasksSubmenu ? (
                    <ChevronDown className="h-3 w-3 absolute -top-1 right-1/4" />
                  ) : (
                    <ChevronUp className="h-3 w-3 absolute -top-1 right-1/4" />
                  )}
                </button>
              ) : (
                <Link
                  to={item.path}
                  className={`w-full h-full flex flex-col items-center justify-center ${
                    isActive(item.path)
                      ? 'text-purple-400'
                      : 'text-gray-400 hover:text-gray-300'
                  }`}
                >
                  <item.icon className="h-6 w-6 mb-1" />
                  <span className="text-xs">{item.label}</span>
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Tasks Submenu */}
      <AnimatePresence>
        {showTasksSubmenu && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="lg:hidden fixed bottom-16 left-0 right-0 z-30 bg-gray-800/95 backdrop-blur-md border-t border-white/10 shadow-lg"
          >
            <div className="flex flex-col p-2">
              {taskSubmenuItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`py-3 px-4 rounded-lg mb-1 ${
                    isActive(item.path)
                      ? 'bg-purple-500/20 text-purple-400'
                      : 'text-gray-300 hover:bg-white/10'
                  }`}
                  onClick={() => setShowTasksSubmenu(false)}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Extra padding at the bottom to prevent content from being hidden behind the navigation bar on mobile */}
      <div className="lg:hidden h-16 w-full"></div>
    </>
  );
};

export default MobileNavigation;