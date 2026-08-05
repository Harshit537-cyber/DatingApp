const Plan = require('../models/plan.model');

const createPlanByAdmin = async (req, res) => {
    try {
        const { name, subtitle, prices, features, isPopular } = req.body;

        const existingPlan = await Plan.findOne({ name });
        if (existingPlan) {
            return res.status(400).json({
                success: false,
                message: 'A plan with this name already exists'
            });
        }

        const plan = await Plan.create({
            name,
            subtitle,
            prices,
            features,
            isPopular
        });

        res.status(201).json({
            success: true,
            message: 'Plan created successfully',
            plan
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

const getAllPlansByAdmin = async (req, res) => {
    try {
        const plans = await Plan.find();
        res.status(200).json({
            success: true,
            count: plans.length,
            plans
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

const getPlanByIdByAdmin = async (req, res) => {
    try {
        const { id } = req.params;
        const plan = await Plan.findById(id);

        if (!plan) {
            return res.status(404).json({
                success: false,
                message: 'Plan not found'
            });
        }

        res.status(200).json({
            success: true,
            plan
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

const updatePlanByAdmin = async (req, res) => {
    try {
        const { id } = req.params;

        const updatedPlan = await Plan.findByIdAndUpdate(id, req.body, {
            new: true,
            runValidators: true
        });

        if (!updatedPlan) {
            return res.status(404).json({
                success: false,
                message: 'Plan not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Plan updated successfully',
            plan: updatedPlan
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

const deletePlanByAdmin = async (req, res) => {
    try {
        const { id } = req.params;
        const plan = await Plan.findById(id);

        if (!plan) {
            return res.status(404).json({
                success: false,
                message: 'Plan not found'
            });
        }

        await Plan.findByIdAndDelete(id);

        res.status(200).json({
            success: true,
            message: 'Plan deleted successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

module.exports = {
    createPlanByAdmin,
    getAllPlansByAdmin,
    getPlanByIdByAdmin,
    updatePlanByAdmin,
    deletePlanByAdmin
};