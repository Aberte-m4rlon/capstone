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
        label: 'Buod ng Bukid',
        icon: <Crown size={20} strokeWidth={2} />,
        roles: ['super_admin'],
      },
      {
        to: '/super-admin',
        label: 'Mga User',
        icon: <Users size={20} strokeWidth={2} />,
        roles: ['super_admin'],
      },
      {
        to: '/admin',
        label: 'Admin Panel',
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
        label: 'Mga Ulat',
        icon: <BarChart3 size={20} strokeWidth={2} />,
        roles: ['super_admin'],
      },
      {
        to: '/activity-log',
        label: 'Activity Log',
        icon: <History size={20} strokeWidth={2} />,
        roles: ['super_admin'],
      },
      {
        to: '/settings',
        label: 'Mga Setting',
        icon: <SettingsIcon size={20} strokeWidth={2} />,
        roles: ['super_admin'],
      },
    ];
  }

  if (activeRole === 'system_admin') {
    return [
      {
        to: '/dashboard',
        label: 'Buod ng Bukid',
        icon: <LayoutDashboard size={20} strokeWidth={2} />,
        roles: ['system_admin'],
      },
      {
        to: '/admin',
        label: 'Mga User',
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
        label: 'Mga Ulat',
        icon: <BarChart3 size={20} strokeWidth={2} />,
        roles: ['system_admin'],
      },
      {
        to: '/notifications',
        label: 'Mga Paalala',
        icon: <Bell size={20} strokeWidth={2} />,
        badgeKey: 'notifications',
        roles: ['system_admin'],
      },
      {
        to: '/settings',
        label: 'Mga Setting',
        icon: <SettingsIcon size={20} strokeWidth={2} />,
        roles: ['system_admin'],
      },
    ];
  }

  // Farm Manager (Default)
  return [
    {
      to: '/dashboard',
      label: 'Buod ng Bukid',
      icon: <LayoutDashboard size={20} strokeWidth={2} />,
      roles: ['farm_manager'],
    },
    {
      to: '/animals',
      label: 'Mga Hayop',
      icon: <GoatIcon size={20} strokeWidth={2} />,
      roles: ['farm_manager'],
    },
    {
      to: '/health',
      label: 'Health Monitoring',
      icon: <HeartPulse size={20} strokeWidth={2} />,
      roles: ['farm_manager'],
    },
    {
      to: '/camera-screening',
      label: 'AI Health Scanner',
      icon: <Camera size={20} strokeWidth={2} />,
      roles: ['farm_manager'],
    },
    {
      to: '/breeding',
      label: 'Breeding',
      icon: <Heart size={20} strokeWidth={2} />,
      roles: ['farm_manager'],
    },
    {
      to: '/vaccinations',
      label: 'Mga Bakuna',
      icon: <Syringe size={20} strokeWidth={2} />,
      badgeKey: 'vaccinations',
      roles: ['farm_manager'],
    },
    {
      to: '/inventory',
      label: 'Farm Inventory',
      icon: <Package size={20} strokeWidth={2} />,
      badgeKey: 'inventory',
      roles: ['farm_manager'],
    },
    {
      to: '/reports',
      label: 'Mga Ulat',
      icon: <BarChart3 size={20} strokeWidth={2} />,
      roles: ['farm_manager'],
    },
    {
      to: '/daily-alerts',
      label: 'Mga Paalala',
      icon: <Bell size={20} strokeWidth={2} />,
      badgeKey: 'alerts',
      roles: ['farm_manager'],
    },
    {
      to: '/settings',
      label: 'Mga Setting',
      icon: <SettingsIcon size={20} strokeWidth={2} />,
      roles: ['farm_manager'],
    },
  ];
}
