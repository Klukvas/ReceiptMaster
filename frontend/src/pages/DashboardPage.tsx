import { useState } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Tabs } from '../components/ui/Tabs';
import { RevenueDashboard } from '../components/RevenueDashboard';
import { TurnoverDashboard } from '../components/TurnoverDashboard';

export const DashboardPage = () => {
  const [dateRange, setDateRange] = useState({
    startDate: '',
    endDate: ''
  });
  const [activeTab, setActiveTab] = useState('revenue');

  const handleDateChange = (field: 'startDate' | 'endDate', value: string) => {
    setDateRange(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const clearDates = () => {
    setDateRange({ startDate: '', endDate: '' });
  };

  const tabs = [
    {
      id: 'revenue',
      label: 'Доход',
      content: <RevenueDashboard dateRange={dateRange} />
    },
    {
      id: 'turnover',
      label: 'Общий оборот',
      content: <TurnoverDashboard dateRange={dateRange} />
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Дашборд</h1>
          <p className="text-gray-600">Анализ доходов и оборота по продуктам и получателям</p>
        </div>
      </div>

      {/* Date filters */}
      <Card title="Фильтр по датам">
        <div className="flex flex-col sm:flex-row gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Дата начала
            </label>
            <input
              type="date"
              value={dateRange.startDate}
              onChange={(e) => handleDateChange('startDate', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Дата окончания
            </label>
            <input
              type="date"
              value={dateRange.endDate}
              onChange={(e) => handleDateChange('endDate', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <Button
            onClick={clearDates}
            variant="outline"
            className="whitespace-nowrap"
          >
            Очистить
          </Button>
        </div>
      </Card>

      {/* Content tabs */}
      <Tabs 
        tabs={tabs} 
        activeTab={activeTab} 
        onTabChange={setActiveTab} 
      />
    </div>
  );
};
