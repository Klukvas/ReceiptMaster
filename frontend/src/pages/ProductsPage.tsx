import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Edit, Trash2, AlertCircle, ChevronUp, ChevronDown, ArrowUpDown } from 'lucide-react';
import { productsApi, formatCurrency, type Product } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Pagination } from '../components/ui/Pagination';
import { ProductForm } from '../components/products/ProductForm';
import { ProductSearchBar } from '../components/products/ProductSearchBar';
import { DeleteConfirmation } from '../components/common/DeleteConfirmation';
import { useTranslation } from '../hooks/useTranslation';

export const ProductsPage = () => {
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    product: Product | null;
  }>({ isOpen: false, product: null });
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [sortBy, setSortBy] = useState<'name' | 'purchase_price_cents' | 'sale_price_cents' | 'quantity' | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(() => {
    // Load from localStorage or use default
    const saved = localStorage.getItem('productsItemsPerPage');
    return saved ? Number(saved) : 10;
  });
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  // Save itemsPerPage to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('productsItemsPerPage', itemsPerPage.toString());
  }, [itemsPerPage]);

  // Debounce search query with 0.4s delay
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      setCurrentPage(1); // Reset to first page when search changes
    }, 400);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load all products once for client-side filtering
  const { data: productsData, isLoading } = useQuery({
    queryKey: ['products', 'all'],
    queryFn: () => productsApi.getAll({ limit: 100 }),
  });

  // Determine if we have an active search
  const hasSearch = debouncedSearchQuery.trim().length > 0;

  // Filter and sort products
  const filteredAndSortedProducts = useMemo(() => {
    if (!productsData?.data.data) return [];
    
    let filtered = productsData.data.data;
    
    // Apply search filter (only when searching)
    if (hasSearch) {
      const query = debouncedSearchQuery.toLowerCase().trim();
      filtered = filtered.filter((product) =>
        product.name.toLowerCase().includes(query)
      );
    }
    
    // Apply sorting
    if (!sortBy) return filtered;
    
    return [...filtered].sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'purchase_price_cents':
          comparison = a.purchase_price_cents - b.purchase_price_cents;
          break;
        case 'sale_price_cents':
          comparison = a.sale_price_cents - b.sale_price_cents;
          break;
        case 'quantity':
          comparison = a.quantity - b.quantity;
          break;
        default:
          return 0;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [productsData?.data.data, debouncedSearchQuery, hasSearch, sortBy, sortOrder]);

  // Calculate pagination for filtered results (always client-side now)
  const totalItems = filteredAndSortedProducts.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  
  // Ensure currentPage is valid when totalPages changes
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);
  
  // Paginate the filtered results on client-side
  const paginatedProducts = filteredAndSortedProducts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  const handleSort = (column: 'name' | 'purchase_price_cents' | 'sale_price_cents' | 'quantity') => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  const deleteMutation = useMutation({
    mutationFn: productsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setNotification({ type: 'success', message: 'Товар успешно удален!' });
      setDeleteConfirmation({ isOpen: false, product: null });
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { message?: string } } };
      setNotification({ 
        type: 'error', 
        message: err.response?.data?.message || 'Ошибка при удалении товара' 
      });
    },
  });

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setShowForm(true);
  };

  const handleDelete = (product: Product) => {
    setDeleteConfirmation({ isOpen: true, product });
  };

  const handleConfirmDelete = () => {
    if (deleteConfirmation.product) {
      deleteMutation.mutate(deleteConfirmation.product.id);
    }
  };

  const handleCancelDelete = () => {
    setDeleteConfirmation({ isOpen: false, product: null });
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingProduct(null);
  };

  // Automatically hide notifications after 3 seconds
  React.useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 dark:text-gray-400">{t('common.loading')}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Notifications */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 p-4 rounded-md shadow-lg ${
          notification.type === 'success' 
            ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300' 
            : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
        }`}>
          <div className="flex items-center">
            {notification.type === 'success' ? (
              <div className="w-5 h-5 text-green-400 dark:text-green-500 mr-2">✓</div>
            ) : (
              <AlertCircle className="w-5 h-5 text-red-400 dark:text-red-500 mr-2" />
            )}
            {notification.message}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{t('products.title')}</h1>
        <Button 
          onClick={() => setShowForm(true)} 
          className="w-full sm:w-auto bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-medium px-6 py-3 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105"
        >
          {t('products.createProduct')}
        </Button>
      </div>

      {/* Search Bar */}
      <ProductSearchBar
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        resultsCount={totalItems}
        showResultsCount={hasSearch}
      />

      <Card>
        <div className="overflow-x-auto shadow-sm rounded-lg">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <button
                    onClick={() => handleSort('name')}
                    className="flex items-center space-x-1 hover:text-gray-700 dark:hover:text-gray-300 transition-colors duration-200"
                  >
                    <span>{t('products.productName')}</span>
                    {sortBy === 'name' ? (
                      sortOrder === 'asc' ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )
                    ) : (
                      <ArrowUpDown className="w-4 h-4 opacity-40" />
                    )}
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <button
                    onClick={() => handleSort('purchase_price_cents')}
                    className="flex items-center space-x-1 hover:text-gray-700 dark:hover:text-gray-300 transition-colors duration-200"
                  >
                    <span>{t('products.purchasePrice')}</span>
                    {sortBy === 'purchase_price_cents' ? (
                      sortOrder === 'asc' ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )
                    ) : (
                      <ArrowUpDown className="w-4 h-4 opacity-40" />
                    )}
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <button
                    onClick={() => handleSort('sale_price_cents')}
                    className="flex items-center space-x-1 hover:text-gray-700 dark:hover:text-gray-300 transition-colors duration-200"
                  >
                    <span>{t('products.salePrice')}</span>
                    {sortBy === 'sale_price_cents' ? (
                      sortOrder === 'asc' ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )
                    ) : (
                      <ArrowUpDown className="w-4 h-4 opacity-40" />
                    )}
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <button
                    onClick={() => handleSort('quantity')}
                    className="flex items-center space-x-1 hover:text-gray-700 dark:hover:text-gray-300 transition-colors duration-200"
                  >
                    <span>{t('products.quantity')}</span>
                    {sortBy === 'quantity' ? (
                      sortOrder === 'asc' ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )
                    ) : (
                      <ArrowUpDown className="w-4 h-4 opacity-40" />
                    )}
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t('products.currency')}
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t('products.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
              {paginatedProducts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="text-gray-500 dark:text-gray-400">
                      {hasSearch ? t('products.noProductsFound') : t('products.noProducts')}
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedProducts.map((product, index) => (
                <tr 
                  key={product.id} 
                  className={`
                    ${product.quantity < 10 ? 'animate-pulse bg-red-100 dark:bg-red-900/20' : (index % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50 dark:bg-gray-800/50')}
                  `}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{product.name}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {formatCurrency(product.purchase_price_cents, product.currency)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {formatCurrency(product.sale_price_cents, product.currency)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className={`text-sm font-semibold ${product.quantity < 10 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}>
                      {product.quantity}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500 dark:text-gray-400">{product.currency}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end space-x-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleEdit(product)}
                        className="p-2"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleDelete(product)}
                        className="p-2"
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Pagination */}
      {totalItems > 0 && (
        <Card>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={itemsPerPage}
            onPageChange={setCurrentPage}
            onItemsPerPageChange={setItemsPerPage}
            itemsPerPageOptions={[10, 20, 50, 100]}
          />
        </Card>
      )}

      {showForm && (
        <ProductForm
          product={editingProduct}
          onClose={handleFormClose}
        />
      )}

      <DeleteConfirmation
        isOpen={deleteConfirmation.isOpen}
        onClose={handleCancelDelete}
        onConfirm={handleConfirmDelete}
        title={t('products.deleteProduct')}
        message={t('products.deleteProductMessage')}
        itemName={deleteConfirmation.product?.name}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
};
