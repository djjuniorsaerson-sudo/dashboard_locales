import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Products() {
  const { token, currentLocation } = useAuth();
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCatalog = async () => {
      if (!currentLocation?.id) {
        setCategories([]);
        setProducts([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const response = await fetch(`/api/v1/yummy-installations/${currentLocation.id}/catalog`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) {
          const data = await response.json();
          setCategories(data.categories || []);
          setProducts(data.products || []);
        } else {
          setCategories([]);
          setProducts([]);
        }
      } catch (error) {
        console.error('Error fetching synced catalog:', error);
        setCategories([]);
        setProducts([]);
      } finally {
        setLoading(false);
      }
    };

    fetchCatalog();
  }, [token, currentLocation?.id]);

  const getCategoryName = (product) =>
    categories.find((category) => category.external_id === product.category_external_id)?.name || 'Sin categoría';

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="mb-2 sm:mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Catálogo Sincronizado</h2>
          <p className="text-gray-400 text-sm mt-1 max-w-2xl">
            Datos centralizados del local activo. Esta vista no depende de una consulta en vivo.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
        <div className="col-span-2 xl:col-span-1 bg-gray-800 rounded-xl border border-gray-700 p-5">
          <div className="text-gray-400 text-sm">Local activo</div>
          <div className="text-white font-bold mt-1">{currentLocation?.name || 'Sin local seleccionado'}</div>
        </div>
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
          <div className="text-gray-400 text-sm">Categorías</div>
          <div className="text-white font-bold mt-1">{categories.length}</div>
        </div>
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
          <div className="text-gray-400 text-sm">Productos</div>
          <div className="text-white font-bold mt-1">{products.length}</div>
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl border border-gray-700 p-5 mb-6">
        <h3 className="text-lg font-semibold text-white mb-3">Categorías sincronizadas</h3>
        {categories.length === 0 ? (
          <p className="text-gray-500 text-sm">Todavía no hay categorías sincronizadas.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <span
                key={category.id}
                className="px-3 py-1 rounded-full text-sm bg-blue-500/20 text-blue-300 border border-blue-500/30"
              >
                {category.name}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden shadow-lg">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Cargando catálogo central...</div>
        ) : (
          <>
            <div className="divide-y divide-gray-700 md:hidden">
              {products.map((product) => (
                <div key={product.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-white break-words">{product.name}</div>
                      <div className="text-sm text-gray-400 mt-1">{getCategoryName(product)}</div>
                    </div>
                    <span className={`shrink-0 px-2 py-1 rounded-full text-xs font-medium ${product.active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                      {product.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="bg-gray-900/60 rounded-lg p-3">
                      <div className="text-gray-500 text-xs uppercase tracking-wide">Precio</div>
                      <div className="text-white font-semibold mt-1">${Number(product.price || 0).toLocaleString()}</div>
                    </div>
                    <div className="bg-gray-900/60 rounded-lg p-3">
                      <div className="text-gray-500 text-xs uppercase tracking-wide">Stock</div>
                      <div className="text-white font-semibold mt-1">{Number(product.stock || 0).toLocaleString()}</div>
                    </div>
                  </div>
                </div>
              ))}
              {products.length === 0 && (
                <div className="px-6 py-8 text-center text-gray-500">
                  No hay productos sincronizados todavía.
                </div>
              )}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-400">
                <thead className="bg-gray-900 text-gray-300 uppercase font-semibold">
                  <tr>
                    <th className="px-6 py-4">Nombre</th>
                    <th className="px-6 py-4">Categoría</th>
                    <th className="px-6 py-4">Precio</th>
                    <th className="px-6 py-4">Stock</th>
                    <th className="px-6 py-4">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr key={product.id} className="border-t border-gray-700 hover:bg-gray-750 transition-colors">
                      <td className="px-6 py-4 font-medium text-white">{product.name}</td>
                      <td className="px-6 py-4">{getCategoryName(product)}</td>
                      <td className="px-6 py-4">${Number(product.price || 0).toLocaleString()}</td>
                      <td className="px-6 py-4">{Number(product.stock || 0).toLocaleString()}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${product.active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                          {product.active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {products.length === 0 && (
                    <tr>
                      <td colSpan="5" className="px-6 py-8 text-center text-gray-500">
                        No hay productos sincronizados todavía.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
