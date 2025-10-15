  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([loadTasks(), loadCategories()]);
      setIsLoading(false);
    };

    loadData();
    
    const tasksSubscription = supabase
      .channel('tasks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        loadTasks();
      })
      .subscribe();

    const categoriesSubscription = supabase
      .channel('categories')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, () => {
        loadCategories();
      })
      .subscribe();

    return () => {
      tasksSubscription.unsubscribe();
      categoriesSubscription.unsubscribe();
    };
  }, []); // Empty dependency array is now correct

  // Remove the separate loadData function that was outside useEffect
