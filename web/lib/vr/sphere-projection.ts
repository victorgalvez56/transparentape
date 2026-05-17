/**
 * Proyección esférica para el globo 3D estilo Google Earth.
 *
 * Tomamos (lng, lat) en grados decimales y devolvemos un punto en la
 * superficie de una esfera de radio GLOBE_RADIUS. Usamos la formula
 * estándar para que matchee la textura equirectangular world-map.jpg.
 */

import * as THREE from "three";

export const GLOBE_RADIUS = 30;

/**
 * Convierte (lng, lat) → posición en superficie de la esfera.
 * Compatible con SphereGeometry de three.js (norte = +Y).
 */
export function lngLatToVec3(
  lng: number,
  lat: number,
  radius: number = GLOBE_RADIUS
): THREE.Vector3 {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lng + 180) * Math.PI) / 180;
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

/**
 * Normal radial (vector unitario apuntando del centro hacia la superficie).
 * Usado para orientar las columnas radialmente.
 */
export function getNormal(lng: number, lat: number): THREE.Vector3 {
  return lngLatToVec3(lng, lat, 1).normalize();
}

/**
 * Quaternion para alinear el eje Y de un cilindro con la normal
 * (que el cilindro "salga" radialmente del globo).
 */
const _up = new THREE.Vector3(0, 1, 0);
export function quaternionFromNormal(normal: THREE.Vector3): THREE.Quaternion {
  return new THREE.Quaternion().setFromUnitVectors(_up, normal);
}
