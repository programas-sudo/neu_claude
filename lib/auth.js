import { supabase } from "./supabaseClient";

// Nunca trae pin_hash (está bloqueado a nivel de columna en la base,
// pero igual no lo pedimos).
export async function getUsuarios() {
  const { data, error } = await supabase
    .from("usuarios")
    .select("id, nombre, es_admin, activo")
    .order("nombre");
  if (error) throw error;
  return data;
}

export async function crearUsuario(nombre, pin, esAdmin) {
  const { data, error } = await supabase
    .from("usuarios")
    .insert({ nombre: nombre.trim(), pin_hash: "", es_admin: !!esAdmin })
    .select()
    .single();
  if (error) throw error;
  const { error: errPin } = await supabase.rpc("crear_o_actualizar_pin", {
    p_usuario_id: data.id,
    p_pin: pin,
  });
  if (errPin) throw errPin;
  return data;
}

export async function actualizarUsuario(id, { nombre, es_admin, activo }) {
  const cambios = {};
  if (nombre !== undefined) cambios.nombre = nombre.trim();
  if (es_admin !== undefined) cambios.es_admin = es_admin;
  if (activo !== undefined) cambios.activo = activo;
  const { error } = await supabase.from("usuarios").update(cambios).eq("id", id);
  if (error) throw error;
}

export async function cambiarPin(usuarioId, pinNuevo) {
  const { error } = await supabase.rpc("crear_o_actualizar_pin", {
    p_usuario_id: usuarioId,
    p_pin: pinNuevo,
  });
  if (error) throw error;
}

export async function eliminarUsuario(id) {
  const { error } = await supabase.from("usuarios").delete().eq("id", id);
  if (error) throw error;
}

// Devuelve true/false. La comparación del PIN pasa siempre por esta
// función de la base (nunca se trae el hash al navegador).
export async function verificarPin(usuarioId, pin) {
  const { data, error } = await supabase.rpc("verificar_pin", {
    p_usuario_id: usuarioId,
    p_pin: pin,
  });
  if (error) throw error;
  return !!data;
}
