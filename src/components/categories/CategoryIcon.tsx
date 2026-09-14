import React from 'react';
import {
  Utensils,
  Coffee,
  Pizza,
  ShoppingBag,
  ShoppingCart,
  Tag,
  Shirt,
  Package,
  Car,
  Bus,
  Plane,
  Fuel,
  Bike,
  Home,
  Receipt,
  Zap,
  Tv,
  Wifi,
  Wrench,
  HeartPulse,
  Dumbbell,
  Pill,
  Smile,
  Baby,
  Film,
  Gamepad2,
  Music,
  Camera,
  Ticket,
  Briefcase,
  Laptop,
  TrendingUp,
  Coins,
  Banknote,
  Landmark,
  PiggyBank,
  Gift,
  GraduationCap,
  Store,
  CircleEllipsis,
  ShieldCheck,
  Sparkles,
  Smartphone,
  BookOpen,
  Heart,
  PawPrint,
  Flame,
  HelpCircle,
} from 'lucide-react';

export interface CategoryIconOption {
  name: string;
  label: string;
  group: 'Food' | 'Shopping' | 'Transport' | 'Bills' | 'Health' | 'Life' | 'Income' | 'General';
}

export const CATEGORY_ICONS: CategoryIconOption[] = [
  // Food & Drink
  { name: 'Utensils', label: 'Dining', group: 'Food' },
  { name: 'Coffee', label: 'Coffee / Cafe', group: 'Food' },
  { name: 'Pizza', label: 'Fast Food', group: 'Food' },
  
  // Shopping
  { name: 'ShoppingBag', label: 'Shopping', group: 'Shopping' },
  { name: 'ShoppingCart', label: 'Groceries', group: 'Shopping' },
  { name: 'Shirt', label: 'Clothing', group: 'Shopping' },
  { name: 'Tag', label: 'Retail / Sale', group: 'Shopping' },
  { name: 'Package', label: 'Delivery / Courier', group: 'Shopping' },

  // Transport
  { name: 'Car', label: 'Car / Cab', group: 'Transport' },
  { name: 'Fuel', label: 'Fuel / Gas', group: 'Transport' },
  { name: 'Bus', label: 'Public Transit', group: 'Transport' },
  { name: 'Plane', label: 'Flights / Travel', group: 'Transport' },
  { name: 'Bike', label: 'Bicycle / Two Wheeler', group: 'Transport' },

  // Housing & Bills
  { name: 'Home', label: 'Rent / Home', group: 'Bills' },
  { name: 'Receipt', label: 'Bills / Invoices', group: 'Bills' },
  { name: 'Zap', label: 'Electricity / Power', group: 'Bills' },
  { name: 'Wifi', label: 'Internet / Telecom', group: 'Bills' },
  { name: 'Tv', label: 'Streaming / TV', group: 'Bills' },
  { name: 'Wrench', label: 'Repairs / Maintenance', group: 'Bills' },

  // Health & Lifestyle
  { name: 'HeartPulse', label: 'Healthcare', group: 'Health' },
  { name: 'Dumbbell', label: 'Gym / Fitness', group: 'Health' },
  { name: 'Pill', label: 'Pharmacy / Medicine', group: 'Health' },
  { name: 'Smile', label: 'Self Care', group: 'Health' },

  // Life & Entertainment
  { name: 'Film', label: 'Movies / Cinema', group: 'Life' },
  { name: 'Gamepad2', label: 'Gaming', group: 'Life' },
  { name: 'Music', label: 'Music & Concerts', group: 'Life' },
  { name: 'Camera', label: 'Hobby / Photo', group: 'Life' },
  { name: 'Ticket', label: 'Events / Outing', group: 'Life' },
  { name: 'PawPrint', label: 'Pets', group: 'Life' },
  { name: 'Baby', label: 'Kids & Family', group: 'Life' },
  { name: 'GraduationCap', label: 'Education / Tuition', group: 'Life' },
  { name: 'BookOpen', label: 'Books / Courses', group: 'Life' },

  // Income & Finance
  { name: 'Briefcase', label: 'Salary / Job', group: 'Income' },
  { name: 'Laptop', label: 'Freelance / Tech', group: 'Income' },
  { name: 'TrendingUp', label: 'Investments', group: 'Income' },
  { name: 'Coins', label: 'Dividends / Cash', group: 'Income' },
  { name: 'Banknote', label: 'Cash Income', group: 'Income' },
  { name: 'Landmark', label: 'Bank / Interest', group: 'Income' },
  { name: 'PiggyBank', label: 'Savings Deposit', group: 'Income' },
  { name: 'Gift', label: 'Gifts & Rewards', group: 'Income' },
  { name: 'Store', label: 'Business & Store', group: 'Income' },

  // General
  { name: 'Sparkles', label: 'Special', group: 'General' },
  { name: 'Smartphone', label: 'Mobile / Gadgets', group: 'General' },
  { name: 'ShieldCheck', label: 'Insurance', group: 'General' },
  { name: 'Heart', label: 'Charity / Donations', group: 'General' },
  { name: 'Flame', label: 'Hot / Trending', group: 'General' },
  { name: 'CircleEllipsis', label: 'Other', group: 'General' },
];

export const CATEGORY_PALETTE = [
  '#FFE600', // Neo Yellow
  '#05DF72', // Neo Green
  '#2EE59D', // Mint Emerald
  '#00F0FF', // Neo Cyan
  '#38BDF8', // Sky Blue
  '#9B51E0', // Deep Purple
  '#FF4D8D', // Hot Pink
  '#FF4343', // Neo Red
  '#FF8800', // Neo Orange
  '#F59E0B', // Amber Gold
  '#A3E635', // Lime
  '#6366F1', // Indigo
  '#14B8A6', // Teal
  '#EC4899', // Fuchsia
  '#121212', // Onyx Black
];

interface CategoryIconProps {
  name: string;
  size?: number;
  className?: string;
  strokeWidth?: number;
}

export const CategoryIcon: React.FC<CategoryIconProps> = ({
  name,
  size = 18,
  className = '',
  strokeWidth = 2.5,
}) => {
  const iconProps = { size, className, strokeWidth };

  switch (name) {
    case 'Utensils': return <Utensils {...iconProps} />;
    case 'Coffee': return <Coffee {...iconProps} />;
    case 'Pizza': return <Pizza {...iconProps} />;
    case 'ShoppingBag': return <ShoppingBag {...iconProps} />;
    case 'ShoppingCart': return <ShoppingCart {...iconProps} />;
    case 'Shirt': return <Shirt {...iconProps} />;
    case 'Tag': return <Tag {...iconProps} />;
    case 'Package': return <Package {...iconProps} />;
    case 'Car': return <Car {...iconProps} />;
    case 'Bus': return <Bus {...iconProps} />;
    case 'Plane': return <Plane {...iconProps} />;
    case 'Fuel': return <Fuel {...iconProps} />;
    case 'Bike': return <Bike {...iconProps} />;
    case 'Home': return <Home {...iconProps} />;
    case 'Receipt': return <Receipt {...iconProps} />;
    case 'Zap': return <Zap {...iconProps} />;
    case 'Tv': return <Tv {...iconProps} />;
    case 'Wifi': return <Wifi {...iconProps} />;
    case 'Wrench': return <Wrench {...iconProps} />;
    case 'HeartPulse': return <HeartPulse {...iconProps} />;
    case 'Dumbbell': return <Dumbbell {...iconProps} />;
    case 'Pill': return <Pill {...iconProps} />;
    case 'Smile': return <Smile {...iconProps} />;
    case 'Baby': return <Baby {...iconProps} />;
    case 'Film': return <Film {...iconProps} />;
    case 'Gamepad2': return <Gamepad2 {...iconProps} />;
    case 'Music': return <Music {...iconProps} />;
    case 'Camera': return <Camera {...iconProps} />;
    case 'Ticket': return <Ticket {...iconProps} />;
    case 'PawPrint': return <PawPrint {...iconProps} />;
    case 'GraduationCap': return <GraduationCap {...iconProps} />;
    case 'BookOpen': return <BookOpen {...iconProps} />;
    case 'Briefcase': return <Briefcase {...iconProps} />;
    case 'Laptop': return <Laptop {...iconProps} />;
    case 'TrendingUp': return <TrendingUp {...iconProps} />;
    case 'Coins': return <Coins {...iconProps} />;
    case 'Banknote': return <Banknote {...iconProps} />;
    case 'Landmark': return <Landmark {...iconProps} />;
    case 'PiggyBank': return <PiggyBank {...iconProps} />;
    case 'Gift': return <Gift {...iconProps} />;
    case 'Store': return <Store {...iconProps} />;
    case 'Sparkles': return <Sparkles {...iconProps} />;
    case 'Smartphone': return <Smartphone {...iconProps} />;
    case 'ShieldCheck': return <ShieldCheck {...iconProps} />;
    case 'Heart': return <Heart {...iconProps} />;
    case 'Flame': return <Flame {...iconProps} />;
    case 'CircleEllipsis': return <CircleEllipsis {...iconProps} />;
    default:
      return <HelpCircle {...iconProps} />;
  }
};
