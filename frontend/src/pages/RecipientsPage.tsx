import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Edit, Trash2 } from 'lucide-react';
import { recipientsApi, type Recipient } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { RecipientForm } from '../components/RecipientForm';

export const RecipientsPage = () => {
  const [showForm, setShowForm] = useState(false);
  const [editingRecipient, setEditingRecipient] = useState<Recipient | null>(null);
  const queryClient = useQueryClient();

  const { data: recipientsData, isLoading } = useQuery({
    queryKey: ['recipients'],
    queryFn: () => recipientsApi.getAll({ limit: 100 }),
  });

  const deleteMutation = useMutation({
    mutationFn: recipientsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipients'] });
    },
  });

  const handleEdit = (recipient: Recipient) => {
    setEditingRecipient(recipient);
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this recipient?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingRecipient(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Recipients</h1>
        <Button 
          onClick={() => setShowForm(true)} 
          className="w-full sm:w-auto bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-medium px-4 py-2 sm:px-6 sm:py-3 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105 text-sm sm:text-base"
        >
          Add Recipient
        </Button>
      </div>

      <Card>
        <div className="overflow-x-auto shadow-sm rounded-lg">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Phone
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Address
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {recipientsData?.data.data.map((recipient, index) => (
                <tr key={recipient.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{recipient.name}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">{recipient.email || '-'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">{recipient.phone || '-'}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-500 max-w-xs truncate">{recipient.address || '-'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end space-x-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleEdit(recipient)}
                        className="p-2"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleDelete(recipient.id)}
                        className="p-2"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {showForm && (
        <RecipientForm
          recipient={editingRecipient}
          onClose={handleFormClose}
        />
      )}
    </div>
  );
};
