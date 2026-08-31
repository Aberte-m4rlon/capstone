import React from 'react';
import {
  LayoutDashboard,
  HeartPulse,
  Heart,
  Package,
  Syringe,
  Camera,
  BarChart3,
  Bell,
  Settings as SettingsIcon,
  Crown,
  Users,
  ShieldAlert,
  TrendingUp,
  History,
} from 'lucide-react';
import { GoatIcon } from './GoatIcon';

export interface NavItemConfig {
  to: string;
  label: string;
  icon: React.ReactNode;
  badgeKey?: 'notifications' | 'vaccinations' | 'inventory' | 'alerts';
  roles: ('farm_manager' | 'system_admin' | 'super_admin')[];
}

/**
 * Get clean role-specific navigation list
 */
export function getNavItemsForRole(role: string | null): NavItemConfig[] {
  const activeRole = role || 'farm_manager';

  if (activeRole === 'super_admin') {
    return [
      {
        to: '/super-admin',
        label: 'Dashboard',
        icon: <Crown size={20} strokeWidth={2} />,
        roles: ['super_admin'],
      },
      {
        to: '/super-admin',
        label: 'User Management',
        icon: <Users size={20} strokeWidth={2} />,
        roles: ['super_admin'],
      },
      {
        to: '/admin',
        label: 'Admin Management',
        icon: <ShieldAlert size={20} strokeWidth={2} />,
        roles: ['super_admin'],
      },
      {
        to: '/analytics',
        label: 'Analytics',
        icon: <TrendingUp size={20} strokeWidth={2} />,
        roles: ['super_admin'],
      },
      {
        to: '/reports',
        label: 'System Reports',
        icon: <BarChart3 size={20} strokeWidth={2} />,
        roles: ['super_admin'],
      },
      {
        to: '/activity-log',
        label: 'Activity Logs',
        icon: <History size={20} strokeWidth={2} />,
        roles: ['super_admin'],
      },
      {
        to: '/settings',
        label: 'Settings',
        icon: <SettingsIcon size={20} strokeWidth={2} />,
        roles: ['super_admin'],
      },
    ];
  }

  if (activeRole === 'system_admin') {
    return [
      {
        to: '/dashboard',
        label: 'Dashboard',
        icon: <LayoutDashboard size={20} strokeWidth={2} />,
        roles: ['system_admin'],
      },
      {
        to: '/admin',
        label: 'User Management',
        icon: <Users size={20} strokeWidth={2} />,
        roles: ['system_admin'],
      },
      {
        to: '/analytics',
        label: 'Analytics',
        icon: <TrendingUp size={20} strokeWidth={2} />,
        roles: ['system_admin'],
      },
      {
        to: '/reports',
        label: 'System Reports',
        icon: <BarChart3 size={20} strokeWidth={2} />,
        roles: ['system_admin'],
      },
      {
        to: '/notifications',
        label: 'Notifications',
        icon: <Bell size={20} strokeWidth={2} />,
        badgeKey: 'notifications',
        roles: ['system_admin'],
      },
      {
        to: '/settings',
        label: 'Settings',
        icon: <SettingsIcon size={20} strokeWidth={2} />,
        roles: ['system_admin'],
      },
    ];
  }

  // Farm Manager (Default)
  return [
    {
      to: '/dashboard',
      label: 'Dashboard',
      icon: <LayoutDashboard size={20} strokeWidth={2} />,
      roles: ['farm_manager'],
    },
    {
      to: '/health',
      label: 'Health Monitoring',
      icon: <HeartPulse size={20} strokeWidth={2} />,
      roles: ['farm_manager'],
    },
    {
      to: '/animals',
      label: 'Mga Hayop / Animals',
      icon: <GoatIcon size={20} strokeWidth={2} />,
      roles: ['farm_manager'],
    },
    {
      to: '/breeding',
      label: 'Breeding',
      icon: <Heart size={20} strokeWidth={2} />,
      roles: ['farm_manager'],
    },
    {
      to: '/inventory',
      label: 'Inventory',
      icon: <Package size={20} strokeWidth={2} />,
      badgeKey: 'inventory',
      roles: ['farm_manager'],
    },
    {
      to: '/vaccinations',
      label: 'Vaccinations',
      icon: <Syringe size={20} strokeWidth={2} />,
      badgeKey: 'vaccinations',
      roles: ['farm_manager'],
    },
    {
      to: '/camera-screening',
      label: 'AI Scanner',
      icon: <Camera size={20} strokeWidth={2} />,
      roles: ['farm_manager'],
    },
    {
      to: '/analytics',
      label: 'Analytics',
      icon: <TrendingUp size={20} strokeWidth={2} />,
      roles: ['farm_manager'],
    },
    {
      to: '/reports',
      label: 'Reports',
      icon: <BarChart3 size={20} strokeWidth={2} />,
      roles: ['farm_manager'],
    },
    {
      to: '/daily-alerts',
      label: 'Alerts',
      icon: <Bell size={20} strokeWidth={2} />,
      badgeKey: 'alerts',
      roles: ['farm_manager'],
    },
    {
      to: '/settings',
      label: 'Settings',
      icon: <SettingsIcon size={20} strokeWidth={2} />,
      roles: ['farm_manager'],
    },
  ];
}
