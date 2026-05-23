/**
 * Notifica a toda la aplicación que datos han cambiado.
 * Llama esto después de cualquier POST / PUT / DELETE que modifique la BD.
 *
 * @param {'payments'|'savings'|'loans'|'clients'|'data'} type
 */
export const notifyUpdate = (type = 'data') => {
    const ts = Date.now().toString();
    localStorage.setItem(`${type}LastUpdate`, ts);
    localStorage.setItem('lastDataUpdate', ts);
    window.dispatchEvent(new CustomEvent(`${type}Updated`));
    window.dispatchEvent(new CustomEvent('dataUpdated'));
};
