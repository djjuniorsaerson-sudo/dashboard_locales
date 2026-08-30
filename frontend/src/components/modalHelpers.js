export const modalErrorMessage = async (response, fallback) => {
  try {
    const data = await response.json();
    return data?.detail || data?.message || data?.error || fallback;
  } catch {
    return fallback;
  }
};
