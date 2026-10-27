import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { AccountGate, FormButton, FormField, FormNotice } from '@/components/form-controls';
import { MealScreen } from '@/components/meal-screen';
import { palette } from '@/constants/design';
import { useAuth } from '@/context/auth-context';
import { createRecipe, deleteRecipe, getRecipes, updateRecipe, type Recipe } from '@/services/meal-planner';

export default function RecipesScreen() {
  const { user } = useAuth();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [imageUrl, setImageUrl] = useState('');

  useEffect(() => {
    if (!user) return;
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true); setError('');
      getRecipes().then(data => { if (active) setRecipes(data); })
        .catch(e => { if (active) setError(e instanceof Error ? e.message : 'No se pudieron cargar tus recetas.'); })
        .finally(() => { if (active) setLoading(false); });
    }, 0);
    return () => { active = false; clearTimeout(timer); };
  }, [user, reload]);

  function reset() { setEditing(null); setName(''); setDescription(''); setInstructions(''); setImageUrl(''); setError(''); }
  function edit(recipe: Recipe) { setEditing(recipe.id_receta); setName(recipe.nombre); setDescription(recipe.descripcion ?? ''); setInstructions(recipe.instrucciones); setImageUrl(recipe.imagen_url ?? ''); setError(''); }
  async function save() {
    setBusy(true); setError('');
    try {
      const data = { nombre: name, descripcion: description || null, instrucciones: instructions, imagen_url: imageUrl || null };
      if (editing) await updateRecipe(editing, data); else await createRecipe(data);
      reset(); setReload(value => value + 1);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar la receta.'); }
    finally { setBusy(false); }
  }
  function remove(recipe: Recipe) { Alert.alert('Eliminar receta', `¿Eliminar “${recipe.nombre}” de tus recetas guardadas?`, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Eliminar', style: 'destructive', onPress: () => { void deleteRecipe(recipe.id_receta).then(() => setReload(n => n + 1)).catch(e => setError(e.message)); } }]); }

  return <MealScreen title="Ideas que dan gusto." subtitle="Guarda, edita y consulta tus recetas favoritas.">
    <AccountGate>
      <View style={styles.card}><Text style={styles.title}>{editing ? 'Editar receta' : 'Guardar una receta'}</Text><FormField label="Nombre de la receta" value={name} onChangeText={setName} maxLength={150} editable={!busy} /><FormField label="Descripción (opcional)" value={description} onChangeText={setDescription} multiline maxLength={4000} editable={!busy} /><FormField label="Instrucciones" value={instructions} onChangeText={setInstructions} multiline maxLength={10000} editable={!busy} /><FormField label="Enlace a imagen (opcional)" value={imageUrl} onChangeText={setImageUrl} autoCapitalize="none" keyboardType="url" maxLength={2048} editable={!busy} />{!!error && <FormNotice>{error}</FormNotice>}<View style={styles.actions}><FormButton label={editing ? 'Guardar cambios' : 'Guardar receta'} onPress={() => { void save(); }} busy={busy} />{editing && <FormButton label="Cancelar" secondary onPress={reset} />}</View></View>
      <View style={styles.card}><View style={styles.row}><Text style={styles.title}>Mis recetas</Text><Pressable accessibilityRole="button" onPress={() => setReload(n => n + 1)}><Text style={styles.link}>Actualizar</Text></Pressable></View>{loading ? <ActivityIndicator accessibilityLabel="Cargando recetas" color={palette.green} /> : recipes.length === 0 ? <Text style={styles.body}>Todavía no guardas recetas. Agrega una arriba para conservarla en tu cuenta.</Text> : recipes.map(recipe => <View key={recipe.id_receta} style={styles.recipe}><Text style={styles.recipeTitle}>{recipe.nombre}</Text>{recipe.descripcion && <Text style={styles.body}>{recipe.descripcion}</Text>}<Text style={styles.instructions}>{recipe.instrucciones}</Text>{recipe.imagen_url && <Text selectable style={styles.url}>{recipe.imagen_url}</Text>}<View style={styles.actions}><FormButton label="Editar" secondary onPress={() => edit(recipe)} /><FormButton label="Eliminar" danger onPress={() => remove(recipe)} /></View></View>)}</View>
    </AccountGate>
  </MealScreen>;
}

const styles = StyleSheet.create({ card: { padding: 20, borderRadius: 20, backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1, gap: 15 }, title: { color: palette.ink, fontSize: 19, fontWeight: '700' }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, link: { color: palette.green, fontWeight: '700', padding: 8 }, body: { color: palette.muted, fontSize: 14, lineHeight: 22 }, recipe: { borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 16, gap: 10 }, recipeTitle: { color: palette.ink, fontSize: 17, fontWeight: '700' }, instructions: { color: palette.ink, fontSize: 14, lineHeight: 22 }, url: { color: palette.green, fontSize: 12 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 } });
