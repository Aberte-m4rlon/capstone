import React from 'react';
import {
  LayoutDashboard,
  HeartPulse,
  Heart,
  Package,
  Syringe,
  BarChart3,
  Bell,
  Settings as SettingsIcon,
  Users,
  Bot,
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
 * Follows exact sequence:
 * MAIN: Buod ng Bukid, Mga Hayop, Health Monitoring, Breeding, Mga Bakuna, Farm Inventory
 * LOWER: Mga Paalala, Mga Ulat
 * BOTTOM: AI Farm Assistant, Mga User (if authorized), Mga Setting
 */
export function getNavItemsForRole(role: string | null): NavItemConfig[] {
  const activeRole = role || 'farm_manager';

  if (activeRole === 'super_admin') {
    return [
      {
        to: '/super-admin',
        label: 'Buod ng Bukid',
        icon: <LayoutDashboard size={20} strokeWidth={2.2} />,
        roles: ['super_admin'],
      },
      {
        to: '/animals',
        label: 'Mga Hayop',
        icon: <GoatIcon size={20} strokeWidth={2.2} />,
        roles: ['super_admin'],
      },
      {
        to: '/health',
        label: 'Health Monitoring',
        icon: <HeartPulse size={20} strokeWidth={2.2} />,
        roles: ['super_admin'],
      },
      {
        to: '/breeding',
        label: 'Breeding',
        icon: <Heart size={20} strokeWidth={2.2} />,
        roles: ['super_admin'],
      },
      {
        to: '/vaccinations',
        label: 'Mga Bakuna',
        icon: <Syringe size={20} strokeWidth={2.2} />,
        badgeKey: 'vaccinations',
        roles: ['super_admin'],
      },
      {
        to: '/inventory',
        label: 'Farm Inventory',
        icon: <Package size={20} strokeWidth={2.2} />,
        badgeKey: 'inventory',
        roles: ['super_admin'],
      },
      {
        to: '/notifications',
        label: 'Mga Paalala',
        icon: <Bell size={20} strokeWidth={2.2} />,
        badgeKey: 'alerts',
        roles: ['super_admin'],
      },
      {
        to: '/reports',
        label: 'Mga Ulat',
        icon: <BarChart3 size={20} strokeWidth={2.2} />,
        roles: ['super_admin'],
      },
      {
        to: '/myai',
        label: 'AI Farm Assistant',
        icon: <Bot size={20} strokeWidth={2.2} />,
        roles: ['super_admin'],
      },
      {
        to: '/admin',
        label: 'Mga User',
        icon: <Users size={20} strokeWidth={2.2} />,
        roles: ['super_admin'],
      },
      {
        to: '/settings',
        label: 'Mga Setting',
        icon: <SettingsIcon size={20} strokeWidth={2.2} />,
        roles: ['super_admin'],
      },
    ];
  }

  if (activeRole === 'system_admin') {
    return [
      {
        to: '/dashboard',
        label: 'Buod ng Bukid',
        icon: <LayoutDashboard size={20} strokeWidth={2.2} />,
        roles: ['system_admin'],
      },
      {
        to: '/animals',
        label: 'Mga Hayop',
        icon: <GoatIcon size={20} strokeWidth={2.2} />,
        roles: ['system_admin'],
      },
      {
        to: '/health',
        label: 'Health Monitoring',
        icon: <HeartPulse size={20} strokeWidth={2.2} />,
        roles: ['system_admin'],
      },
      {
        to: '/breeding',
        label: 'Breeding',
        icon: <Heart size={20} strokeWidth={2.2} />,
        roles: ['system_admin'],
      },
      {
        to: '/vaccinations',
        label: 'Mga Bakuna',
        icon: <Syringe size={20} strokeWidth={2.2} />,
        badgeKey: 'vaccinations',
        roles: ['system_admin'],
      },
      {
        to: '/inventory',
        label: 'Farm Inventory',
        icon: <Package size={20} strokeWidth={2.2} />,
        badgeKey: 'inventory',
        roles: ['system_admin'],
      },
      {
        to: '/notifications',
        label: 'Mga Paalala',
        icon: <Bell size={20} strokeWidth={2.2} />,
        badgeKey: 'alerts',
        roles: ['system_admin'],
      },
      {
        to: '/reports',
        label: 'Mga Ulat',
        icon: <BarChart3 size={20} strokeWidth={2.2} />,
        roles: ['system_admin'],
      },
      {
        to: '/myai',
        label: 'AI Farm Assistant',
        icon: <Bot size={20} strokeWidth={2.2} />,
        roles: ['system_admin'],
      },
      {
        to: '/admin',
        label: 'Mga User',
        icon: <Users size={20} strokeWidth={2.2} />,
        roles: ['system_admin'],
      },
      {
        to: '/settings',
        label: 'Mga Setting',
        icon: <SettingsIcon size={20} strokeWidth={2.2} />,
        roles: ['system_admin'],
      },
    ];
  }

  // Farm Manager (Default)
  return [
    {
      to: '/dashboard',
      label: 'Buod ng Bukid',
      icon: <LayoutDashboard size={20} strokeWidth={2.2} />,
      roles: ['farm_manager'],
    },
    {
      to: '/animals',
      label: 'Mga Hayop',
      icon: <GoatIcon size={20} strokeWidth={2.2} />,
      roles: ['farm_manager'],
    },
    {
      to: '/health',
      label: 'Health Monitoring',
      icon: <HeartPulse size={20} strokeWidth={2.2} />,
      roles: ['farm_manager'],
    },
    {
      to: '/breeding',
      label: 'Breeding',
      icon: <Heart size={20} strokeWidth={2.2} />,
      roles: ['farm_manager'],
    },
    {
      to: '/vaccinations',
      label: 'Mga Bakuna',
      icon: <Syringe size={20} strokeWidth={2.2} />,
      badgeKey: 'vaccinations',
      roles: ['farm_manager'],
    },
    {
      to: '/inventory',
      label: 'Farm Inventory',
      icon: <Package size={20} strokeWidth={2.2} />,
      badgeKey: 'inventory',
      roles: ['farm_manager'],
    },
    {
      to: '/daily-alerts',
      label: 'Mga Paalala',
      icon: <Bell size={20} strokeWidth={2.2} />,
      badgeKey: 'alerts',
      roles: ['farm_manager'],
    },
    {
      to: '/reports',
      label: 'Mga Ulat',
      icon: <BarChart3 size={20} strokeWidth={2.2} />,
      roles: ['farm_manager'],
    },
    {
      to: '/myai',
      label: 'AI Farm Assistant',
      icon: <Bot size={20} strokeWidth={2.2} />,
      roles: ['farm_manager'],
    },
    {
      to: '/settings',
      label: 'Mga Setting',
      icon: <SettingsIcon size={20} strokeWidth={2.2} />,
      roles: ['farm_manager'],
    },
  ];
}
