# Examples -- Non-linear dynamics

This folder contains non-financial example models demonstrating how the
declarative system can represent time-stepped dynamical systems.

The first example models a spacecraft orbiting Earth, perturbed by
the Moon. Thrust controls represent an optional TLI in order to attempt to achieve low lunar orbit.

The second example is a numerical integration of the [Lorenz Equations (1963)](https://en.wikipedia.org/wiki/Lorenz_system).

These examples demonstrate that the declarative modelling system can
express nonlinear dynamics, indexed recursion, and adaptive stepping.

------------------------------------------------------------------------

# 1. Spacecraft orbiting Earth

Using [rocket_with_thrust.xml](rocket_with_thrust.xml) 

# Continuous-time model behind `rocket_with_thrust.xml`

This model is implemented in `rocket_with_thrust.xml` using a **variable-step discrete integrator** (the index set `t` with step size `dt(t)` and accumulated time `\tau(t)`).  
Underneath that implementation is the usual **continuous-time** point-mass dynamics for a spacecraft moving in the planar Earth–Moon system.

Below, I write the *continuous-time differential equations* that the XML is discretizing.

---

## 1) States and frames

Let

- Position (in the inertial 2D plane):  
  \[
  \mathbf r(\tau)=
  \begin{bmatrix}x(\tau)\\y(\tau)\end{bmatrix}
  \qquad [\text{km}]
  \]
- Velocity:  
  \[
  \mathbf v(\tau)=\dot{\mathbf r}(\tau)=
  \begin{bmatrix}v_x(\tau)\\v_y(\tau)\end{bmatrix}
  \qquad [\text{km/s}]
  \]
- Acceleration:  
  \[
  \dot{\mathbf v}(\tau)=
  \begin{bmatrix}a_x(\tau)\\a_y(\tau)\end{bmatrix}
  \qquad [\text{km/s}^2]
  \]

The Earth is at the origin. The Moon moves on a circular orbit of radius `moon_orbit_radius` with angular rate
\[
n \;=\; \frac{2\pi}{T_\text{moon}},
\]
and phase offset `moon_phase0`, so the Moon position is
\[
\mathbf r_m(\tau)=
\begin{bmatrix}
x_m(\tau)\\y_m(\tau)
\end{bmatrix}
=
\begin{bmatrix}
R_m\cos(\theta_m(\tau))\\
R_m\sin(\theta_m(\tau))
\end{bmatrix},
\quad
\theta_m(\tau)=\theta_0+n\tau.
\]

Define relative vectors and magnitudes:
\[
\mathbf r_e=\mathbf r, \quad r_e=\|\mathbf r\|,
\qquad
\mathbf r_{m\!r}=\mathbf r-\mathbf r_m, \quad r_{m\!r}=\|\mathbf r-\mathbf r_m\|.
\]

The XML uses gravitational parameters `mu_earth` and `mu_moon` (units km\(^3\)/s\(^2\)).

---

## 2) Equations of motion (ignoring thrust)

Ignoring thrust, the acceleration is the sum of Earth and Moon point-mass gravity:

\[
\dot{\mathbf r}=\mathbf v
\]

\[
\dot{\mathbf v}
=
-\mu_e\,\frac{\mathbf r}{\|\mathbf r\|^3}
\;-\;
\mu_m\,\frac{\mathbf r-\mathbf r_m}{\|\mathbf r-\mathbf r_m\|^3}.
\]

In components (matching `ax`, `ay` in the XML **without** the thrust terms):

\[
\dot x = v_x,\qquad \dot y = v_y,
\]

\[
\dot v_x
=
-\mu_e\,\frac{x}{(x^2+y^2)^{3/2}}
-\mu_m\,\frac{x-x_m}{\bigl((x-x_m)^2+(y-y_m)^2\bigr)^{3/2}},
\]

\[
\dot v_y
=
-\mu_e\,\frac{y}{(x^2+y^2)^{3/2}}
-\mu_m\,\frac{y-y_m}{\bigl((x-x_m)^2+(y-y_m)^2\bigr)^{3/2}}.
\]

---

## 3) Adding thrust: how the XML defines thrust acceleration

In the XML, thrust enters **directly as an acceleration command**
\[
\mathbf a_\text{thrust}(\tau)=
\begin{bmatrix}
a_{\text{thrust},x}(\tau)\\
a_{\text{thrust},y}(\tau)
\end{bmatrix},
\]
and the full equations of motion become
\[
\dot{\mathbf v}
=
-\mu_e\,\frac{\mathbf r}{\|\mathbf r\|^3}
\;-\;
\mu_m\,\frac{\mathbf r-\mathbf r_m}{\|\mathbf r-\mathbf r_m\|^3}
\;+\;
\mathbf a_\text{thrust}.
\]

Equivalently, in components (this is exactly what the XML encodes in `ax`, `ay`):
\[
\dot v_x = a_x(\tau)=a_{g,x}(\tau)+a_{\text{thrust},x}(\tau),
\qquad
\dot v_y = a_y(\tau)=a_{g,y}(\tau)+a_{\text{thrust},y}(\tau).
\]

### 3.1 Thrust mode switching (piecewise logic)

The XML defines a piecewise thrust acceleration with three modes (priority order):

1. **TLI (trans-lunar injection) burn** when `tli_burn_on(t)=1`  
2. **LOI (lunar orbit insertion) guidance** when `loi_latched(t)=1`  
3. Otherwise, only **Moon avoidance** is applied

In continuous-time notation, this is:

\[
\mathbf a_\text{thrust}(\tau)=
\begin{cases}
a_\text{TLI}\,\hat{\mathbf v}(\tau), & \text{if TLI burn is on},\\[4pt]
\mathbf a_\text{LOI}(\tau)+\mathbf a_\text{avoid}(\tau), & \text{if LOI is latched},\\[4pt]
\mathbf a_\text{avoid}(\tau), & \text{otherwise.}
\end{cases}
\]

where \(a_\text{TLI}=\) `tli_accel` is a constant magnitude (km/s\(^2\)), and \(\hat{\mathbf v}\) is the unit velocity direction:
\[
\hat{\mathbf v}=\frac{\mathbf v}{\max(\varepsilon,\|\mathbf v\|)} \quad\text{(XML uses }\varepsilon=10^{-6}\text{ to avoid divide-by-zero).}
\]

### 3.2 TLI thrust (accelerate along velocity)

When `tli_burn_on` is true, thrust is aligned with velocity:
\[
\mathbf a_\text{TLI}(\tau)=a_\text{TLI}\,\hat{\mathbf v}(\tau).
\]

In the XML, `tli_burn_on` is controlled by a burn-time accumulator `tli_burn_used`:
- Start on at \(\tau=0\)
- Turn off once accumulated burn time reaches `tli_burn_s`
- Can re-trigger near perigee via `near_perigee`

In continuous terms, the burn-time accumulator corresponds to
\[
\dot t_\text{burn}(\tau)=u_\text{TLI}(\tau),
\]
where \(u_\text{TLI}\in\{0,1\}\) is the on/off command produced by that gating logic.

### 3.3 Moon avoidance thrust (repulsive radial push near the Moon)

Avoidance thrust activates when the spacecraft gets inside a safety radius
\[
r_{m\!r}(\tau) < r_\text{safe},
\qquad
r_\text{safe}=\texttt{moon\_radius}+\texttt{moon\_safe\_altitude}.
\]

It applies a constant-magnitude acceleration `moon_avoid_accel` pointing **away from the Moon**:

\[
\mathbf a_\text{avoid}(\tau)
=
a_\text{avoid}\,u_\text{avoid}(\tau)\,\hat{\mathbf r}_{m\!r}(\tau),
\qquad
\hat{\mathbf r}_{m\!r}=\frac{\mathbf r-\mathbf r_m}{\max(\varepsilon,\|\mathbf r-\mathbf r_m\|)}.
\]

where \(u_\text{avoid}(\tau)\in\{0,1\}\) is the threshold switch for the safe radius.

### 3.4 LOI thrust (velocity + radial error feedback near the Moon)

Once the spacecraft gets within a trigger distance `loi_trigger_dist`, the XML **latches** LOI on:
\[
r_{m\!r}(\tau) < r_\text{trigger} \;\Rightarrow\; \text{LOI latched}.
\]

LOI attempts to achieve a target circular orbit radius
\[
r_\text{target}=\texttt{moon\_radius}+\texttt{orbit\_altitude\_target}
\]
with target circular speed
\[
v_\text{circ}=\sqrt{\frac{\mu_m}{r_\text{target}}}.
\]

Define moon-relative velocity:
\[
\mathbf v_\text{rel}=\mathbf v-\dot{\mathbf r}_m.
\]

Define unit radial and tangential directions about the Moon:
\[
\hat{\mathbf r}=\hat{\mathbf r}_{m\!r},
\qquad
\hat{\mathbf t}=
\begin{bmatrix}
-\hat r_y\\
\hat r_x
\end{bmatrix}.
\]

The desired relative velocity is tangential with magnitude \(v_\text{circ}\):
\[
\mathbf v_{\text{rel,des}} = v_\text{circ}\,s\,\hat{\mathbf t},
\]
where the sign \(s\in\{-1,+1\}\) is chosen from the current tangential direction (the XML computes it from the sign of the current tangential component).

The commanded LOI acceleration is a **clamped** (saturated) proportional controller combining:
- tangential/velocity error feedback (gain `loi_gain`)
- radial distance error feedback (gain `loi_radial_gain`)
- saturation at `loi_accel_max`

Component-wise, with saturation \(\mathrm{sat}_{a_\max}(z)=\min(a_\max,\max(-a_\max,z))\):

\[
a_{\text{LOI},x}
=
\mathrm{sat}_{a_{\max}}\!\left(
k_v\,(v_{\text{rel,des},x}-v_{\text{rel},x})
+
k_r\,(r_\text{target}-r_{m\!r})\,\hat r_x
\right),
\]

\[
a_{\text{LOI},y}
=
\mathrm{sat}_{a_{\max}}\!\left(
k_v\,(v_{\text{rel,des},y}-v_{\text{rel},y})
+
k_r\,(r_\text{target}-r_{m\!r})\,\hat r_y
\right),
\]

with
\[
k_v=\texttt{loi\_gain},\quad k_r=\texttt{loi\_radial\_gain},\quad a_{\max}=\texttt{loi\_accel\_max}.
\]

Finally, in the XML the LOI contribution is combined with avoidance (so avoidance can still repel the vehicle if it gets too close):
\[
\mathbf a_\text{thrust} = \mathbf a_\text{LOI} + \mathbf a_\text{avoid}
\quad\text{(when LOI latched).}
\]

---

## 4) Note on the XML’s discrete-time integrator

Although the README above is continuous-time, it may help to know what the XML does numerically:

- It keeps an integer step index \(t=0,1,2,\dots\)
- It adapts the step size `dt(t)` and accumulates real time `tau(t)`
- It uses a **leapfrog / velocity-Verlet style** update with half-step velocities (`vx_half`, `vy_half`)

That scheme discretizes the ODE system written in Sections 2–3.

------------------------------------------------------------------------

# 2. [Lorenz Equations (1963)](https://en.wikipedia.org/wiki/Lorenz_system)

Load [lorenz-difference.xml](lorenz-difference.xml) into the model-editor to integrate

## Equations

$$
\frac{dx}{dt} = \sigma (y - x)
$$

$$
\frac{dy}{dt} = x(\rho - z) - y
$$

$$
\frac{dz}{dt} = xy - \beta z
$$

with classic chaotic parameters

$$
\sigma = 10
$$

$$
\rho = 28
$$

$$
\beta = \frac{8}{3}
$$

Export to Python to output (to Downloads folder) `lorenz.py`.

The static .gif below was output by running in bash (in Downloads folder)

`python3 lorenz.py --steps 60000 --plot-static --plot-vars "lorenz:x,y,z" --gif lorenz60000_static.gif`

 
![Snapshot of a numerical integration of Lorenz equations output by Python rendering.](lorenz60000_static.gif)
------------------------------------------------------------------------

An animated .gif can be output by running in bash (in Downloads folder) 

`python3 lorenz.py --steps 60000 --plot-traj --fps 30 --plot-vars "lorenz:x,y,z" --gif lorenz60000_trajFPS30.gif`


![Animation of a numerical integration of Lorenz equations output by Python rendering.](lorenz60000_trajFPS30.gif)


