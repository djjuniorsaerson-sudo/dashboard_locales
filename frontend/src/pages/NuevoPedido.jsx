import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, ShoppingBag, User } from 'lucide-react';

export default function NuevoPedido() {
  const { token } = useAuth();
  const [products, setProducts] = useState([]);
  
  // Client Form
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [orderType, setOrderType] = useState('Delivery');
  const [paymentMethod, setPaymentMethod] = useState('efectivo');

  // Cart
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    fetch('http://localhost:8000/api/v1/data/products', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(data => setProducts(data.filter(p => p.active)))
    .catch(err => console.error(err));
  }, [token]);

  const handlePhoneBlur = async () => {
    if (!phone) return;
    try {
      const res = await fetch(`http://localhost:8000/api/v1/data/client/${phone}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setName(data.name || '');
        setAddress(data.address || '');
      }
    } catch (e) {
      console.log("Cliente no encontrado, se creará uno nuevo");
    }
  };

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [productAddons, setProductAddons] = useState({ toppings: [], extras: [], guarniciones: [] });

  const openCustomizer = (product) => {
    const hasAddons = (product.toppings && product.toppings.length > 0) || 
                      (product.extras && product.extras.length > 0) || 
                      (product.guarniciones && product.guarniciones.length > 0);
    
    if (hasAddons) {
      setSelectedProduct(product);
      setProductAddons({ toppings: [], extras: [], guarniciones: [] });
    } else {
      addToCart(product, [], [], []);
    }
  };

  const handleAddonToggle = (category, addon) => {
    setProductAddons(prev => {
      const isSelected = prev[category].some(item => item.id === addon.id);
      if (isSelected) {
        return { ...prev, [category]: prev[category].filter(item => item.id !== addon.id) };
      } else {
        return { ...prev, [category]: [...prev[category], addon] };
      }
    });
  };

  const updateAddonQuantity = (category, addon, delta) => {
    setProductAddons(prev => {
      const currentList = prev[category];
      const existing = currentList.find(item => item.id === addon.id);
      
      if (existing) {
        const newQty = (existing.qty || 1) + delta;
        if (newQty <= 0) {
          return { ...prev, [category]: currentList.filter(item => item.id !== addon.id) };
        }
        return { 
          ...prev, 
          [category]: currentList.map(item => item.id === addon.id ? { ...item, qty: newQty } : item) 
        };
      } else if (delta > 0) {
        return { ...prev, [category]: [...currentList, { ...addon, qty: 1 }] };
      }
      return prev;
    });
  };

  const confirmCustomProduct = () => {
    addToCart(selectedProduct, productAddons.toppings, productAddons.extras, productAddons.guarniciones);
    setSelectedProduct(null);
  };

  const generateCustomKey = (productId, toppings, extras, guarniciones) => {
      const topIds = [...toppings].sort((a,b) => a.id - b.id).map(t => `T${t.id}`).join('-');
      const extIds = [...extras].sort((a,b) => a.id - b.id).map(e => `E${e.id}Q${e.qty||1}`).join('-');
      const guaIds = [...guarniciones].sort((a,b) => a.id - b.id).map(g => `G${g.id}Q${g.qty||1}`).join('-');
      return `${productId}|${topIds}|${extIds}|${guaIds}`;
  };

  const calculateAddonsPrice = (toppings, extras, guarniciones) => {
      let t = 0;
      toppings.forEach(x => t += parseFloat(x.price || 0));
      extras.forEach(x => t += parseFloat(x.price || 0) * (x.qty || 1));
      guarniciones.forEach(x => t += parseFloat(x.price || 0) * (x.qty || 1));
      return t;
  };

  const addToCart = (product, toppings = [], extras = [], guarniciones = []) => {
    const addonsTotal = calculateAddonsPrice(toppings, extras, guarniciones);
    const unitPrice = parseFloat(product.price) + addonsTotal;
    const customKey = generateCustomKey(product.id, toppings, extras, guarniciones);

    const existingItemIndex = cart.findIndex(item => item.customKey === customKey);
    
    if (existingItemIndex >= 0) {
      const newCart = [...cart];
      newCart[existingItemIndex].quantity += 1;
      setCart(newCart);
    } else {
      setCart([...cart, { 
        product_id: product.id, 
        product_name: product.name, 
        quantity: 1, 
        price: unitPrice, 
        basePrice: product.price,
        toppings: toppings,
        extras: extras,
        guarniciones: guarniciones,
        customKey: customKey
      }]);
    }
  };

  const updateQuantity = (customKey, delta) => {
    setCart(cart.map(item => {
      if (item.customKey === customKey) {
        const newQ = item.quantity + delta;
        return newQ > 0 ? { ...item, quantity: newQ } : item;
      }
      return item;
    }));
  };

  const removeFromCart = (customKey) => setCart(cart.filter(item => item.customKey !== customKey));

  const total = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);

  const [forceDuplicate, setForceDuplicate] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState('');

  const submitOrder = async (overrideDuplicate = false) => {
    if (cart.length === 0) {
      setErrorMsg("Agrega al menos un producto al carrito");
      return;
    }
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    setDuplicateWarning('');

    const payload = {
      customer_name: name || (orderType === 'Mostrador' ? 'MOSTRADOR' : ''),
      customer_phone: phone,
      customer_address: address,
      order_type: orderType,
      payment_method: paymentMethod,
      allow_duplicate: overrideDuplicate,
      items: cart.map(item => ({
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: item.quantity,
        price: item.price,
        toppings: item.toppings,
        extras: item.extras,
        guarniciones: item.guarniciones
      }))
    };

    if (paymentMethod === 'mixto') {
        payload.payment_breakdown = { efectivo: total, transferencia: 0, debito: 0 };
    }

    try {
      const res = await fetch('http://localhost:8000/api/v1/orders/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if (res.ok) {
        setSuccessMsg("¡Pedido enviado a Yummy con éxito!");
        setCart([]);
        setPhone('');
        setName('');
        setAddress('');
        setForceDuplicate(false);
      } else if (res.status === 409 && !overrideDuplicate) {
        setDuplicateWarning(data.detail?.message || data.detail || "Ya existe un pedido activo para este cliente.");
      } else {
        let errMsg = "Error al crear pedido";
        if (data.detail) {
           if (typeof data.detail === 'string') {
               errMsg = data.detail;
           } else if (data.detail.message) {
               errMsg = data.detail.message;
           } else if (data.detail.detail) {
               errMsg = data.detail.detail;
           } else {
               errMsg = JSON.stringify(data.detail);
           }
        }
        setErrorMsg(errMsg);
      }
    } catch (e) {
      setErrorMsg("Fallo de conexión");
    } finally {
      setLoading(false);
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.05 } }
  };
  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
  };

  return (
    <div className="p-6 flex gap-6 h-[calc(100vh-100px)]">
      {/* Catálogo de Productos */}
      <div className="flex-1 flex flex-col bg-gray-900 rounded-2xl border border-gray-800/50 shadow-2xl overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-96 bg-blue-500/10 blur-[120px] pointer-events-none rounded-full"></div>
        <div className="p-5 border-b border-gray-800/80 bg-gray-900/50 backdrop-blur-xl z-10 flex items-center">
          <ShoppingBag className="w-5 h-5 text-blue-400 mr-2" />
          <h2 className="text-xl font-bold text-white tracking-wide">Catálogo Rápido</h2>
        </div>
        <div className="p-5 overflow-y-auto flex-1 z-10 custom-scrollbar">
          <motion.div 
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
          >
            {products.map(p => (
              <motion.button 
                variants={itemVariants}
                whileHover={{ scale: 1.03, y: -2 }}
                whileTap={{ scale: 0.97 }}
                key={p.id}
                onClick={() => openCustomizer(p)}
                className="group relative bg-gray-800/40 backdrop-blur-md border border-gray-700/50 p-5 rounded-2xl flex flex-col items-center justify-center text-center transition-all hover:bg-gray-800/80 hover:border-blue-500/50 overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-t from-blue-500/0 to-blue-500/0 group-hover:from-blue-500/10 group-hover:to-transparent transition-all"></div>
                <span className="font-bold text-white mb-2 relative z-10 drop-shadow-md">{p.name}</span>
                <span className="text-emerald-400 font-bold relative z-10 bg-emerald-500/10 px-3 py-1 rounded-full text-sm">${p.price.toLocaleString()}</span>
              </motion.button>
            ))}
          </motion.div>
        </div>
      </div>
      
      {/* Panel Lateral del Pedido */}
      <div className="w-[420px] flex flex-col bg-gray-900/90 backdrop-blur-xl rounded-2xl border border-gray-800/50 overflow-hidden shrink-0 shadow-2xl relative">
        <div className="p-5 border-b border-gray-800/80 bg-gray-900/50 backdrop-blur-xl z-10">
          <div className="flex items-center mb-4">
            <User className="w-5 h-5 text-emerald-400 mr-2" />
            <h2 className="text-xl font-bold text-white tracking-wide">Nuevo Pedido</h2>
          </div>
          
          <div className="space-y-3 relative z-10">
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Teléfono</label>
                <input 
                  type="text" 
                  value={phone} 
                  onChange={(e) => setPhone(e.target.value)} 
                  onBlur={handlePhoneBlur}
                  className="w-full bg-gray-950/50 border border-gray-700/50 focus:border-blue-500/50 rounded-xl p-2.5 text-white mt-1 text-sm outline-none transition-colors"
                  placeholder="1122334455"
                />
              </div>
              <div className="flex-1">
                <label className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Nombre</label>
                <input 
                  type="text" 
                  value={name} 
                  onChange={(e) => setName(e.target.value)} 
                  className="w-full bg-gray-950/50 border border-gray-700/50 focus:border-blue-500/50 rounded-xl p-2.5 text-white mt-1 text-sm outline-none transition-colors"
                  placeholder="Ej. Juan P."
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Dirección</label>
              <input 
                type="text" 
                value={address} 
                onChange={(e) => setAddress(e.target.value)} 
                className="w-full bg-gray-950/50 border border-gray-700/50 focus:border-blue-500/50 rounded-xl p-2.5 text-white mt-1 text-sm outline-none transition-colors"
              />
            </div>
            
            <div className="flex gap-2 pt-2">
              <select value={orderType} onChange={(e) => setOrderType(e.target.value)} className="flex-1 bg-gray-800 border border-gray-700 rounded-xl p-2.5 text-white text-sm outline-none focus:border-blue-500/50 transition-colors">
                <option value="Delivery">Delivery</option>
                <option value="Mostrador">Mostrador</option>
                <option value="Lo busca">Retiro</option>
              </select>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="flex-1 bg-gray-800 border border-gray-700 rounded-xl p-2.5 text-white text-sm outline-none focus:border-blue-500/50 transition-colors">
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="debito">Débito</option>
                <option value="mixto">Mixto</option>
              </select>
            </div>
          </div>
        </div>

        {/* Ticket Animado */}
        <div className="flex-1 overflow-y-auto p-5 bg-gray-950/50 custom-scrollbar relative">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center opacity-50">
              <ShoppingBag className="w-12 h-12 text-gray-600 mb-3" />
              <p className="text-gray-500 text-sm font-medium tracking-wide">Tu ticket está vacío</p>
            </div>
          ) : (
            <div className="space-y-4">
              <AnimatePresence>
                {cart.map(item => (
                  <motion.div 
                    layout
                    initial={{ opacity: 0, x: -20, scale: 0.9 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 20, scale: 0.9 }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                    key={item.customKey} 
                    className="flex justify-between items-start bg-gray-900 p-4 rounded-2xl border border-gray-800 shadow-sm"
                  >
                    <div className="flex-1">
                      <p className="font-bold text-gray-100 text-lg">{item.product_name}</p>
                      {item.toppings.length > 0 && <p className="text-xs text-gray-400 mt-1 flex items-center gap-1"><span className="w-1 h-1 rounded-full bg-emerald-500"></span> {item.toppings.map(t=>t.name).join(', ')}</p>}
                      {item.extras.length > 0 && <p className="text-xs text-gray-400 mt-1 flex items-center gap-1"><span className="w-1 h-1 rounded-full bg-blue-500"></span> {item.extras.map(e=>`${e.qty > 1 ? e.qty+'x ' : ''}${e.name}`).join(', ')}</p>}
                      {item.guarniciones.length > 0 && <p className="text-xs text-gray-400 mt-1 flex items-center gap-1"><span className="w-1 h-1 rounded-full bg-orange-500"></span> {item.guarniciones.map(g=>`${g.qty > 1 ? g.qty+'x ' : ''}${g.name}`).join(', ')}</p>}
                      <p className="text-sm font-black text-emerald-400 mt-2">${item.price.toLocaleString()}</p>
                    </div>
                    <div className="flex flex-col items-end gap-3 ml-2">
                      <div className="flex items-center gap-1 bg-gray-950 p-1 rounded-xl border border-gray-800">
                        <button onClick={() => updateQuantity(item.customKey, -1)} className="w-7 h-7 rounded-lg bg-gray-800 text-gray-300 flex items-center justify-center hover:bg-gray-700 transition-colors hover:text-white">-</button>
                        <span className="w-6 text-center font-bold text-sm">{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.customKey, 1)} className="w-7 h-7 rounded-lg bg-gray-800 text-gray-300 flex items-center justify-center hover:bg-gray-700 transition-colors hover:text-white">+</button>
                      </div>
                      <button onClick={() => removeFromCart(item.customKey)} className="text-xs text-red-500/70 hover:text-red-400 font-medium transition-colors flex items-center group">
                        <Trash2 className="w-3.5 h-3.5 mr-1 group-hover:scale-110 transition-transform" /> Quitar
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Totales y Botón de Cobro */}
        <div className="p-5 border-t border-gray-800 bg-gray-900/80 backdrop-blur-md z-10 shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
          <div className="flex justify-between items-center mb-4">
            <span className="text-gray-400 font-bold uppercase tracking-widest text-xs">Total</span>
            <span className="text-3xl font-black text-emerald-400 drop-shadow-md">${total.toLocaleString()}</span>
          </div>

          {errorMsg && <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl mb-3 text-sm font-medium text-center">{errorMsg}</div>}
          {successMsg && <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-3 rounded-xl mb-3 text-sm font-medium text-center">{successMsg}</div>}
          {duplicateWarning && (
            <div className="bg-orange-500/10 border border-orange-500/20 p-3 rounded-xl mb-3 text-center">
              <p className="text-orange-400 text-sm font-medium mb-2">{duplicateWarning}</p>
              <div className="flex gap-2">
                <button onClick={() => setDuplicateWarning('')} className="flex-1 bg-gray-800 text-gray-300 text-xs py-2 rounded-lg hover:bg-gray-700 font-bold">Cancelar</button>
                <button onClick={() => submitOrder(true)} className="flex-1 bg-orange-500 text-black text-xs py-2 rounded-lg hover:bg-orange-400 font-bold">Forzar Creación</button>
              </div>
            </div>
          )}

          {!duplicateWarning && (
            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              disabled={loading || cart.length === 0}
              onClick={() => submitOrder(false)}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 disabled:opacity-50 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center text-lg"
            >
              {loading ? 'Procesando...' : 'Confirmar Pedido'}
            </motion.button>
          )}
        </div>
      </div>

      {/* Modal Customizer */}
      <AnimatePresence>
        {selectedProduct && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, y: 100, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 100, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="bg-gray-900 border border-gray-700/50 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-gray-800/80 bg-gray-800/30 flex justify-between items-start backdrop-blur-md">
                <div>
                  <h3 className="text-2xl font-bold text-white mb-1">{selectedProduct.name}</h3>
                  <p className="text-emerald-400 font-bold text-lg">${selectedProduct.price.toLocaleString()}</p>
                </div>
                <button onClick={() => setSelectedProduct(null)} className="text-gray-500 hover:text-white transition-colors bg-gray-800 hover:bg-gray-700 p-2 rounded-full">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
              </div>

              <div className="p-6 overflow-y-auto flex-1 custom-scrollbar bg-gray-900/80">
                {selectedProduct.toppings && selectedProduct.toppings.length > 0 && (
                  <div className="mb-8">
                    <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center"><span className="w-2 h-2 rounded-full bg-emerald-500 mr-2"></span> Toppings (Si/No)</h4>
                    <div className="grid grid-cols-2 gap-3">
                      {selectedProduct.toppings.map(t => {
                        const isSelected = productAddons.toppings.some(x => x.id === t.id);
                        return (
                          <button 
                            key={t.id} 
                            onClick={() => handleAddonToggle('toppings', t)}
                            className={`p-3 rounded-xl border flex items-center justify-between transition-all ${isSelected ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400 shadow-sm' : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'}`}
                          >
                            <span className="font-medium text-sm">{t.name}</span>
                            {isSelected && <CheckCircle2 className="w-4 h-4" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {selectedProduct.extras && selectedProduct.extras.length > 0 && (
                  <div className="mb-8">
                    <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center"><span className="w-2 h-2 rounded-full bg-blue-500 mr-2"></span> Extras (+ Precio)</h4>
                    <div className="space-y-3">
                      {selectedProduct.extras.map(e => {
                        const selected = productAddons.extras.find(x => x.id === e.id);
                        const qty = selected ? selected.qty : 0;
                        return (
                          <div key={e.id} className="flex items-center justify-between bg-gray-800/50 border border-gray-700/50 p-3 rounded-xl">
                            <div>
                              <p className="font-medium text-gray-200 text-sm">{e.name}</p>
                              <p className="text-xs text-emerald-400 font-bold">+${(parseFloat(e.price) || 0).toLocaleString()}</p>
                            </div>
                            <div className="flex items-center gap-3 bg-gray-900 p-1 rounded-lg border border-gray-800">
                              <button onClick={() => updateAddonQuantity('extras', e, -1)} disabled={!qty} className="w-8 h-8 rounded-md bg-gray-800 text-white flex items-center justify-center hover:bg-gray-700 disabled:opacity-30 transition-colors">-</button>
                              <span className="w-4 text-center font-bold text-sm text-white">{qty}</span>
                              <button onClick={() => updateAddonQuantity('extras', e, 1)} className="w-8 h-8 rounded-md bg-gray-800 text-white flex items-center justify-center hover:bg-gray-700 transition-colors"><Plus className="w-4 h-4" /></button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {selectedProduct.guarniciones && selectedProduct.guarniciones.length > 0 && (
                  <div>
                    <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center"><span className="w-2 h-2 rounded-full bg-orange-500 mr-2"></span> Guarniciones</h4>
                    <div className="space-y-3">
                      {selectedProduct.guarniciones.map(g => {
                        const selected = productAddons.guarniciones.find(x => x.id === g.id);
                        const qty = selected ? selected.qty : 0;
                        return (
                          <div key={g.id} className="flex items-center justify-between bg-gray-800/50 border border-gray-700/50 p-3 rounded-xl">
                            <div>
                              <p className="font-medium text-gray-200 text-sm">{g.name}</p>
                              <p className="text-xs text-emerald-400 font-bold">+${(parseFloat(g.price) || 0).toLocaleString()}</p>
                            </div>
                            <div className="flex items-center gap-3 bg-gray-900 p-1 rounded-lg border border-gray-800">
                              <button onClick={() => updateAddonQuantity('guarniciones', g, -1)} disabled={!qty} className="w-8 h-8 rounded-md bg-gray-800 text-white flex items-center justify-center hover:bg-gray-700 disabled:opacity-30 transition-colors">-</button>
                              <span className="w-4 text-center font-bold text-sm text-white">{qty}</span>
                              <button onClick={() => updateAddonQuantity('guarniciones', g, 1)} className="w-8 h-8 rounded-md bg-gray-800 text-white flex items-center justify-center hover:bg-gray-700 transition-colors"><Plus className="w-4 h-4" /></button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-gray-800 bg-gray-950">
                <motion.button 
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={confirmCustomProduct} 
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-500/20 transition-all flex justify-center items-center gap-2 text-lg"
                >
                  <Plus className="w-5 h-5" />
                  Agregar al Ticket
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
