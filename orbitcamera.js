var OrbitCamera = pc.createScript('orbitCamera');

OrbitCamera.attributes.add('distanceMax', {type: 'number', default: 0, title: 'Distance Max', description: 'Setting this at 0 will give an infinite distance limit'});
OrbitCamera.attributes.add('distanceMin', {type: 'number', default: 0, title: 'Distance Min'});
OrbitCamera.attributes.add('pitchAngleMax', {type: 'number', default: 90, title: 'Pitch Angle Max (degrees)'});
OrbitCamera.attributes.add('pitchAngleMin', {type: 'number', default: -90, title: 'Pitch Angle Min (degrees)'});
//OrbitCamera.attributes.add('triggerEntity', { type: 'entity' });

OrbitCamera.attributes.add('inertiaFactor', {
    type: 'number',
    default: 0,
    title: 'Inertia Factor',
    description: 'Higher value means that the camera will continue moving after the user has stopped dragging. 0 is fully responsive.'
});

OrbitCamera.attributes.add('focusEntity', {
    type: 'entity',
    title: 'Focus Entity',
    description: 'Entity for the camera to focus on. If blank, then the camera will use the whole scene'
});

OrbitCamera.attributes.add('frameOnStart', {
    type: 'boolean',
    default: true,
    title: 'Frame on Start',
    description: 'Frames the entity or scene at the start of the application."'
});


// Property to get and set the distance between the pivot point and camera
// Clamped between this.distanceMin and this.distanceMax
Object.defineProperty(OrbitCamera.prototype, "distance", {
    get: function() {
        return this._targetDistance;
    },

    set: function(value) {
        this._targetDistance = this._clampDistance(value);
    }
});


// Property to get and set the pitch of the camera around the pivot point (degrees)
// Clamped between this.pitchAngleMin and this.pitchAngleMax
// When set at 0, the camera angle is flat, looking along the horizon
Object.defineProperty(OrbitCamera.prototype, "pitch", {
    get: function() {
        return this._targetPitch;
    },

    set: function(value) {
        this._targetPitch = this._clampPitchAngle(value);
    }
});


// Property to get and set the yaw of the camera around the pivot point (degrees)
Object.defineProperty(OrbitCamera.prototype, "yaw", {
    get: function() {
        return this._targetYaw;
    },

    set: function(value) {
        this._targetYaw = value;

        // Ensure that the yaw takes the shortest route by making sure that 
        // the difference between the targetYaw and the actual is 180 degrees
        // in either direction
        var diff = this._targetYaw - this._yaw;
        var reminder = diff % 360;
        if (reminder > 180) {
            this._targetYaw = this._yaw - (360 - reminder);
        } else if (reminder < -180) {
            this._targetYaw = this._yaw + (360 + reminder);
        } else {
            this._targetYaw = this._yaw + reminder;
        }
    }
});


// Property to get and set the world position of the pivot point that the camera orbits around
Object.defineProperty(OrbitCamera.prototype, "pivotPoint", {
    get: function() {
        return this._pivotPoint;
    },

    set: function(value) {
        this._pivotPoint.copy(value);
    }
});


// Moves the camera to look at an entity and all its children so they are all in the view
OrbitCamera.prototype.focus = function (focusEntity) {
    // Calculate an bounding box that encompasses all the models to frame in the camera view
    this._buildAabb(focusEntity, 0);

    var halfExtents = this._modelsAabb.halfExtents;

    var distance = Math.max(halfExtents.x, Math.max(halfExtents.y, halfExtents.z));
    distance = (distance / Math.tan(0.5 * this.entity.camera.fov * pc.math.DEG_TO_RAD));
    distance = (distance * 2);

    this.distance = distance;

    this._removeInertia();

    this._pivotPoint.copy(this._modelsAabb.center);
};


// Changes the distance of the camera to look at an entity and all its children so they are all in the view
OrbitCamera.prototype.smoothFocus = function (focusEntity) {
    // Calculate an bounding box that encompasses all the models to frame in the camera view
    this._buildAabb(focusEntity, 0);

    var halfExtents = this._modelsAabb.halfExtents;

    var distance = Math.max(halfExtents.x, Math.max(halfExtents.y, halfExtents.z));
    distance = (distance / Math.tan(0.5 * this.entity.camera.fov * pc.math.DEG_TO_RAD));
    distance = (distance * 1.0);
    
    this.distance = distance;
    
   
   // removeInertia makes the camera move to position without lerp 
   // this._removeInertia();

    this._pivotPoint.copy(this._modelsAabb.center);
};



OrbitCamera.distanceBetween = new pc.Vec3();

// Set the camera position to a world position and look at a world position
// Useful if you have multiple viewing angles to swap between in a scene
OrbitCamera.prototype.resetAndLookAtPoint = function (resetPoint, lookAtPoint) {
    console.log("resetAndLookAtPoint");
    this.pivotPoint.copy(lookAtPoint);
    this.entity.setPosition(resetPoint);

    this.entity.lookAt(lookAtPoint);

    var distance = OrbitCamera.distanceBetween;
    distance.sub2(lookAtPoint, resetPoint);
    this.distance = distance.length();

    this.pivotPoint.copy(lookAtPoint);

    var cameraQuat = this.entity.getRotation();
    this.yaw = this._calcYaw(cameraQuat);
    this.pitch = this._calcPitch(cameraQuat, this.yaw);

    this._removeInertia();
    this._updatePosition();
};



// Set camera position to a world position and look at an entity in the scene
// Useful if you have multiple models to swap between in a scene
OrbitCamera.prototype.resetAndLookAtEntity = function (resetPoint, entity) {
    this._buildAabb(entity, 0);
    this.resetAndLookAtPoint(resetPoint, this._modelsAabb.center);
};


// Set the camera at a specific, yaw, pitch and distance without inertia (instant cut)
OrbitCamera.prototype.reset = function (yaw, pitch, distance) {
    this.pitch = pitch;
    this.yaw = yaw;
    this.distance = distance;

    //this._removeInertia();
};

/////////////////////////////////////////////////////////////////////////////////////////////
// Private methods

OrbitCamera.prototype.initialize = function () {
    var self = this;
    var onWindowResize = function () {
        self._checkAspectRatio();
    };

    window.addEventListener('resize', onWindowResize, false);

    this._checkAspectRatio();

    // Find all the models in the scene that are under the focused entity
    this._modelsAabb = new pc.BoundingBox();
    this._buildAabb(this.focusEntity || this.app.root, 0);

    this.entity.lookAt(this._modelsAabb.center);

    this._pivotPoint = new pc.Vec3();
    this._pivotPoint.copy(this._modelsAabb.center);

    // Calculate the camera euler angle rotation around x and y axes
    // This allows us to place the camera at a particular rotation to begin with in the scene
    var cameraQuat = this.entity.getRotation();

    // Preset the camera
    this._yaw = this._calcYaw(cameraQuat);
    this._pitch = this._clampPitchAngle(this._calcPitch(cameraQuat, this._yaw));
    this.entity.setLocalEulerAngles(this._pitch, this._yaw, 0);

    this._distance = 0;

    this._targetYaw = this._yaw;
    this._targetPitch = this._pitch;

    // If we have ticked focus on start, then attempt to position the camera where it frames
    // the focused entity and move the pivot point to entity's position otherwise, set the distance
    // to be between the camera position in the scene and the pivot point
    if (this.frameOnStart) {
        this.focus(this.focusEntity || this.app.root);
    } else {
        var distanceBetween = new pc.Vec3();
        distanceBetween.sub2(this.entity.getPosition(), this._pivotPoint);
        this._distance = this._clampDistance(distanceBetween.length());
    }

    this._targetDistance = this._distance;

    // Reapply the clamps if they are changed in the editor
    this.on('attr:distanceMin', function (value, prev) {
        this._targetDistance = this._clampDistance(this._distance);
    });

    this.on('attr:distanceMax', function (value, prev) {
        this._targetDistance = this._clampDistance(this._distance);
    });

    this.on('attr:pitchAngleMin', function (value, prev) {
        this._targetPitch = this._clampPitchAngle(this._pitch);
    });

    this.on('attr:pitchAngleMax', function (value, prev) {
        this._targetPitch = this._clampPitchAngle(this._pitch);
    });

    // Focus on the entity if we change the focus entity
    this.on('attr:focusEntity', function (value, prev) {
        if (this.frameOnStart) {
            this.focus(value || this.app.root);
            
        } else {
            this.resetAndLookAtEntity(this.entity.getPosition(), value || this.app.root);
        }
    });

    this.on('attr:frameOnStart', function (value, prev) {
        if (value) {
            this.focus(this.focusEntity || this.app.root);
        }
    });

    this.on('destroy', function() {
        window.removeEventListener('resize', onWindowResize, false);
    });
    
    this.app.on('setFocus', function(value) {
        //self.focus(value);
        self.smoothFocus(value);
    });
    
    
   //this.app.on("setlookAtHotspot", this.resetPoint, this.lookAtPoint,this);
    this.app.on("lookAtHotspot", function(position, target) {
        
        self.lookAtHotspot(position, target);
    });
    
    
     this.app.on("lookAndFocusAtHotspot", function(position, target, returnToInitialViewangle) {
        if (returnToInitialViewangle === undefined) {
            returnToInitialViewangle = true;
        }
        self.lookAndFocusAtHotspot(position, target, returnToInitialViewangle );
    });
    
    this.app.on('focusEntity', function (resetEntity, focusEntity) {       
        self.resetAndLookAtEntity(self.entity.getPosition(), focusEntity || this.app.root);
        
    });
   
 
    //## lookAtHotspot helpers ##//
    this.teCam= new pc.Entity(); 
    this.Goto = false;
    this.GotoTimer = 0.0;
    this.GotoSpeed = 1.0;

    this.newDis = new pc.Vec3();
        
    this._lockPivot =new pc.Vec3();
    this._lockDist = 0.0 ;
    this._lockYaw = 0.0 ;
    this._lockPitch = 0.0 ;
    
    this.camPos = new pc.Vec3();
    this.camRot = new pc.Quat();
    this.targPos = new pc.Vec3();
    this.targRot =  new pc.Quat();
    this.startPos = new pc.Vec3();
    this.startRot =  new pc.Quat();
    
   
};

/**
 * Move Camera to 'resetPoint' and look at 'lookAtPoint'
 * @param resetPoint {Vec3} new camera position to move to
 * @param lookAtPoint {entity} new point to look at
 */
OrbitCamera.prototype.lookAtHotspot = function(resetPoint, lookAtPoint) {
    
    if (resetPoint == "Camera") {
        resetPoint = this.camPos;
    }
    
    
    // Calculate an bounding box that encompasses all the models to frame in the camera view
    this._buildAabb(lookAtPoint, 0);

    var halfExtents = this._modelsAabb.halfExtents;

    var distance = Math.max(halfExtents.x, Math.max(halfExtents.y, halfExtents.z));
    distance = (distance / Math.tan(0.5 * this.entity.camera.fov * pc.math.DEG_TO_RAD));
    distance = (distance *2.0);

    this.distance = distance;

    this._removeInertia();

    this._pivotPoint.copy(this._modelsAabb.center);
    
    lookAtPoint = this._pivotPoint;
    
    if(this.Goto)return;
    console.log("lookAtHotspot");
    this._lockPivot.copy(lookAtPoint);          

    this.teCam.setPosition(resetPoint);            
    this.teCam.lookAt(lookAtPoint);              

    this.newDis.sub2(lookAtPoint, resetPoint);    

    this.startPos.copy(this.entity.getPosition());
    this.startRot.copy(this.entity.getRotation());
    this.targPos.copy(this.teCam.getPosition());
    this.targRot.copy(this.teCam.getRotation());       

    this._lockDist = this.newDis.length();                
    this._lockYaw = this._calcYaw(this.targRot);             
    this._lockPitch = this._calcPitch(this.targRot , this._targetYaw);


    this.Goto = true;
    this.GotoTimer = 0.0;
    
    
    //this.smoothFocus(lookAtPoint);
    
};

/**
 * Move Camera focus on 'lookAtPoint' and moves as far away as necessary
 * @param resetPoint {Vec3} new camera position to move to (optional). Enter "camera" to stay a current position.
 * @param lookAtPoint {entity} new point to look at
 * @param returnToInitialViewangle {bool} True camera return to the default view position defined by resetpoint on start
 */
OrbitCamera.prototype.lookAndFocusAtHotspot = function(resetPoint, lookAtPoint, returnToInitialViewangle) {
    
    if (resetPoint == "Camera") {
        resetPoint = this.camPos;
    }
    
    
    // Calculate an bounding box that encompasses all the models to frame in the camera view
    this._buildAabb(lookAtPoint, 0);

    var halfExtents = this._modelsAabb.halfExtents;

    var distance = Math.max(halfExtents.x, Math.max(halfExtents.y, halfExtents.z));
    distance = (distance / Math.tan(0.5 * this.entity.camera.fov * pc.math.DEG_TO_RAD));
    distance = (distance *1.0);

    this.distance = distance;
    
     var lookDirection = new pc.Vec3();
    lookDirection.sub2(lookAtPoint.getPosition(), resetPoint);
    
    //console.log(this.entity.forward.normalize().mulScalar(distance));
    //console.log(lookAtPoint.getPosition());
    
    // Calculate new resetPoint based on distance
      console.log(returnToInitialViewangle);
    if (returnToInitialViewangle === true) {
        // point in direction of reset camera position
        resetPoint.sub2(lookAtPoint.getPosition(),lookDirection.normalize().mulScalar(distance));
    } else {
        // point in direction of current camera position
        resetPoint.sub2(lookAtPoint.getPosition(),this.entity.forward.normalize().mulScalar(distance));
    }


    this._removeInertia();

    this._pivotPoint.copy(this._modelsAabb.center);
    
    lookAtPoint = this._pivotPoint;
    
    if(this.Goto)return;
    console.log("lookAtHotspot");
    this._lockPivot.copy(lookAtPoint);          

    this.teCam.setPosition(resetPoint);            
    this.teCam.lookAt(lookAtPoint);              

    this.newDis.sub2(lookAtPoint, resetPoint);    

    this.startPos.copy(this.entity.getPosition());
    this.startRot.copy(this.entity.getRotation());
    this.targPos.copy(this.teCam.getPosition());
    this.targRot.copy(this.teCam.getRotation());       

    this._lockDist = this.newDis.length();                
    this._lockYaw = this._calcYaw(this.targRot);             
    this._lockPitch = this._calcPitch(this.targRot , this._targetYaw);


    this.Goto = true;
    this.GotoTimer = 0.0;
    
    
    //this.smoothFocus(lookAtPoint);
    
};


OrbitCamera.prototype.update = function(dt) {
    // Add inertia, if any
    if(this.Goto){
        if(this.GotoTimer < 1.0){
            
            //console.log(this.GotoTimer);
            this.GotoTimer +=  this.GotoSpeed * dt;
            var vt = Math.sin((this.GotoTimer-0.5)*3.1416)*0.5+0.5;
            //var vt = pc.math.clamp(this.GotoTimer,0,1);
            this.camPos.lerp(this.startPos,this.targPos, vt);
            this.camRot.slerp(this.startRot, this.targRot,vt); 
            this.entity.setPosition(this.camPos);
            this.entity.setRotation(this.camRot);

        }
        else{
            this.GotoTimer=1.0;
            this.Goto=false;
              
            this.newDis.sub2(this._lockPivot, this.entity.getPosition());      
            this._targetDistance = this.newDis.length();                
            this._targetYaw = this._calcYaw(this.entity.getRotation());             
            this._targetPitch= this._calcPitch(this.entity.getRotation() , this._targetYaw); 

            this.pivotPoint.copy(this._lockPivot);
            this._removeInertia();
            this._updatePosition();
        }    
    }
    else{
        var t = this.inertiaFactor === 0 ? 1 : Math.min(dt / this.inertiaFactor, 1);
        this._distance = pc.math.lerp(this._distance, this._targetDistance, t);
        this._yaw = pc.math.lerp(this._yaw, this._targetYaw, t);
        this._pitch = pc.math.lerp(this._pitch, this._targetPitch, t);
        this._updatePosition();
    }

};


OrbitCamera.prototype._updatePosition = function () {
    // Work out the camera position based on the pivot point, pitch, yaw and distance
    this.entity.setPosition(0,0,0);
    this.entity.setEulerAngles(this._pitch, this._yaw, 0);     //Important to update：Steigungswinkel, Rollwinkel，横摇角

    var position = this.entity.getPosition();
    position.copy(this.entity.forward);
    position.scale(-this._distance);             //Important to update：Abstand
    position.add(this.pivotPoint);               //Important to update：Ziel-Punkt-Position
    this.entity.setPosition(position);
};


OrbitCamera.prototype._removeInertia = function () {
    this._yaw = this._targetYaw;
    this._pitch = this._targetPitch;
    this._distance = this._targetDistance;
};


OrbitCamera.prototype._checkAspectRatio = function () {
    var height = this.app.graphicsDevice.height;
    var width = this.app.graphicsDevice.width;

    // Match the axis of FOV to match the aspect ratio of the canvas so
    // the focused entities is always in frame
    this.entity.camera.horizontalFov = height > width;
};


OrbitCamera.prototype._buildAabb = function (entity, modelsAdded) {
    var i = 0;

    if (entity.model) {
        var mi = entity.model.meshInstances;
        for (i = 0; i < mi.length; i++) {
            if (modelsAdded === 0) {
                this._modelsAabb.copy(mi[i].aabb);
            } else {
                this._modelsAabb.add(mi[i].aabb);
            }

            modelsAdded += 1;
        }
    }

    for (i = 0; i < entity.children.length; ++i) {
        modelsAdded += this._buildAabb(entity.children[i], modelsAdded);
    }

    return modelsAdded;
};


OrbitCamera.prototype._calcYaw = function (quat) {
    var transformedForward = new pc.Vec3();
    quat.transformVector(pc.Vec3.FORWARD, transformedForward);

    return Math.atan2(-transformedForward.x, -transformedForward.z) * pc.math.RAD_TO_DEG;
};


OrbitCamera.prototype._clampDistance = function (distance) {
    if (this.distanceMax > 0) {
        return pc.math.clamp(distance, this.distanceMin, this.distanceMax);
    } else {
        return Math.max(distance, this.distanceMin);
    }
};


OrbitCamera.prototype._clampPitchAngle = function (pitch) {
    // Negative due as the pitch is inversed since the camera is orbiting the entity
    return pc.math.clamp(pitch, -this.pitchAngleMax, -this.pitchAngleMin);
};


OrbitCamera.quatWithoutYaw = new pc.Quat();
OrbitCamera.yawOffset = new pc.Quat();

OrbitCamera.prototype._calcPitch = function(quat, yaw) {
    var quatWithoutYaw = OrbitCamera.quatWithoutYaw;
    var yawOffset = OrbitCamera.yawOffset;

    yawOffset.setFromEulerAngles(0, -yaw, 0);
    quatWithoutYaw.mul2(yawOffset, quat);

    var transformedForward = new pc.Vec3();

    quatWithoutYaw.transformVector(pc.Vec3.FORWARD, transformedForward);

    return Math.atan2(transformedForward.y, -transformedForward.z) * pc.math.RAD_TO_DEG;
};