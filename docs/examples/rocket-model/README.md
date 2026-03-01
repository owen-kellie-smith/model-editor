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
`python3 lorenz.py --steps 60000 --plot-static --plot-vars "lorenz:x,y,z" --gif lorenz60000_static.gif

 
![Snapshot of a numerical integration of Lorenz equations output by Python rendering.](lorenz60000_static.gif)
------------------------------------------------------------------------

The animated .gif below was output by running in bash (in Downloads folder) 
`python3 lorenz.py --steps 60000 --plot-traj --fps 30 --plot-vars "lorenz:x,y,z" --gif lorenz60000_trajFPS30.gif


![Animation of a numerical integration of Lorenz equations output by Python rendering.](lorenz60000_trajFPS30.gif)


